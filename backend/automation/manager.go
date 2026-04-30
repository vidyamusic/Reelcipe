package automation

import (
	"encoding/json"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/cookbook/worker/extractor"
	"github.com/playwright-community/playwright-go"
)

type ZeptoSession struct {
	Pw           *playwright.Playwright
	Browser      playwright.Browser
	Context      playwright.BrowserContext
	Page         playwright.Page
	PhoneNumber  string
	UserID       string
	Token        string
	OTPChan      chan string
	TimeoutTimer *time.Timer
}

var (
	sessions   = make(map[string]*ZeptoSession) // map[user_id]Session
	sessionsMu sync.Mutex
)

func InitPlaywright() error {
	err := playwright.Install()
	if err != nil {
		log.Printf("Playwright installation error: %v", err)
		// We ignore error here since it might be already installed
	}
	return nil
}

func GetSession(userID string) (*ZeptoSession, bool) {
	sessionsMu.Lock()
	defer sessionsMu.Unlock()
	sess, ok := sessions[userID]
	return sess, ok
}

func cleanupSession(userID string) {
	sessionsMu.Lock()
	defer sessionsMu.Unlock()
	if sess, ok := sessions[userID]; ok {
		if sess.Browser != nil {
			sess.Browser.Close()
		}
		if sess.Pw != nil {
			sess.Pw.Stop()
		}
		delete(sessions, userID)
	}
}

// StartLoginFlow initializes a Playwright browser, navigates to Zepto, and asks for OTP.
func StartLoginFlow(userID, phoneNumber, userToken string) error {
	// Cleanup existing session if any
	cleanupSession(userID)

	pw, err := playwright.Run()
	if err != nil {
		return fmt.Errorf("could not start playwright: %v", err)
	}

	browser, err := pw.Chromium.Launch(playwright.BrowserTypeLaunchOptions{
		Headless: playwright.Bool(true),
	})
	if err != nil {
		pw.Stop()
		return fmt.Errorf("could not launch browser: %v", err)
	}

	context, err := browser.NewContext(playwright.BrowserNewContextOptions{
		UserAgent: playwright.String("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"),
	})
	if err != nil {
		browser.Close()
		pw.Stop()
		return err
	}

	page, err := context.NewPage()
	if err != nil {
		browser.Close()
		pw.Stop()
		return err
	}

	session := &ZeptoSession{
		Pw:          pw,
		Browser:     browser,
		Context:     context,
		Page:        page,
		PhoneNumber: phoneNumber,
		UserID:      userID,
		Token:       userToken,
		OTPChan:     make(chan string),
	}

	sessionsMu.Lock()
	sessions[userID] = session
	sessionsMu.Unlock()

	// Timeout to close browser if OTP is not provided within 2 minutes
	session.TimeoutTimer = time.AfterFunc(2*time.Minute, func() {
		log.Printf("Session timeout for %s", userID)
		cleanupSession(userID)
	})

	go runLoginAutomation(session)

	return nil
}

func runLoginAutomation(sess *ZeptoSession) {
	// Simple Zepto automation (Conceptual, selectors might vary)
	_, err := sess.Page.Goto("https://www.zeptonow.com/")
	if err != nil {
		log.Printf("Zepto navigation error: %v", err)
		cleanupSession(sess.UserID)
		return
	}

	// Wait for login button and click
	err = sess.Page.Click("text=Login / Sign Up", playwright.PageClickOptions{Timeout: playwright.Float(10000)})
	if err != nil {
        // Alternative selector
        err = sess.Page.Click("button:has-text('Login')", playwright.PageClickOptions{Timeout: playwright.Float(5000)})
        if err != nil {
            log.Printf("Could not find login button: %v", err)
            cleanupSession(sess.UserID)
            return
        }
	}

	// Enter phone number
	err = sess.Page.Fill("input[type='tel']", sess.PhoneNumber)
	if err != nil {
		log.Printf("Could not fill phone number: %v", err)
		cleanupSession(sess.UserID)
		return
	}

	// Click continue
	err = sess.Page.Click("button:has-text('Continue')")
	if err != nil {
		log.Printf("Could not click continue: %v", err)
		cleanupSession(sess.UserID)
		return
	}

	// Now wait for OTP from the channel
	select {
	case otp := <-sess.OTPChan:
		sess.TimeoutTimer.Stop()
		// Enter OTP
		// Zepto usually has multiple input fields for OTP, or one hidden.
		// A common way in Playwright is to just type it if the first box is focused
		err = sess.Page.Keyboard().Type(otp)
		if err != nil {
			log.Printf("Failed to type OTP: %v", err)
			cleanupSession(sess.UserID)
			return
		}

		// Wait for successful login (e.g. check if user profile or cart appears)
		sess.Page.WaitForSelector("text=Cart", playwright.PageWaitForSelectorOptions{Timeout: playwright.Float(10000)})

		// Extract cookies
		cookies, err := sess.Context.Cookies()
		if err == nil {
			cookiesJSON, _ := json.Marshal(cookies)
			// Save cookies to Supabase using REST API
			extractor.UpsertZeptoSession(sess.UserID, sess.PhoneNumber, sess.Token, string(cookiesJSON), "authenticated")
		} else {
			log.Printf("Failed to extract cookies: %v", err)
		}

		cleanupSession(sess.UserID)
	case <-time.After(2 * time.Minute):
		// This should be handled by the TimeoutTimer anyway
	}
}

func SubmitOTP(userID, otp string) error {
	sess, ok := GetSession(userID)
	if !ok {
		return fmt.Errorf("no active session found for user, it might have timed out")
	}
	sess.OTPChan <- otp
	return nil
}
