package extractor

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"time"
)

// UpdateRecipeStatus updates the extraction status and data in Supabase
func UpdateRecipeStatus(recipeID, userToken, status, errorMessage string, ingredients []Ingredient, steps []Step, rawText string, thumbnailURL string) error {
	supabaseURL := os.Getenv("SUPABASE_URL")
	anonKey := os.Getenv("SUPABASE_ANON_KEY")
	if anonKey == "" {
		anonKey = os.Getenv("SUPABASE_SERVICE_KEY")
	}

	if supabaseURL == "" {
		return fmt.Errorf("SUPABASE_URL is not set")
	}

	url := fmt.Sprintf("%s/rest/v1/saved_recipes?id=eq.%s", supabaseURL, recipeID)

	payload := map[string]interface{}{
		"status": status,
	}

	if errorMessage != "" {
		payload["error_message"] = errorMessage
	}
	if ingredients != nil {
		payload["parsed_ingredients"] = ingredients
	}
	if steps != nil {
		payload["parsed_steps"] = steps
	}
	if thumbnailURL != "" {
		payload["thumbnail_url"] = thumbnailURL
	}
	if rawText != "" {
		payload["raw_text"] = rawText
	}

	return sendPatch(url, anonKey, userToken, payload)
}

// UpdateRecipeTitle updates just the title
func UpdateRecipeTitle(recipeID, userToken, title string) error {
	supabaseURL := os.Getenv("SUPABASE_URL")
	anonKey := os.Getenv("SUPABASE_ANON_KEY")
	if anonKey == "" {
		anonKey = os.Getenv("SUPABASE_SERVICE_KEY")
	}

	url := fmt.Sprintf("%s/rest/v1/saved_recipes?id=eq.%s", supabaseURL, recipeID)
	payload := map[string]interface{}{"title": title}

	return sendPatch(url, anonKey, userToken, payload)
}

func UpsertZeptoSession(userID, phoneNumber, userToken, cookies, status string) error {
	supabaseURL := os.Getenv("SUPABASE_URL")
	anonKey := os.Getenv("SUPABASE_ANON_KEY")
	if anonKey == "" {
		anonKey = os.Getenv("SUPABASE_SERVICE_KEY")
	}

	url := fmt.Sprintf("%s/rest/v1/zepto_sessions", supabaseURL)

    var cookiesJSON interface{}
    json.Unmarshal([]byte(cookies), &cookiesJSON)
    if cookiesJSON == nil {
        cookiesJSON = []interface{}{}
    }

	payload := map[string]interface{}{
		"user_id":      userID,
		"phone_number": phoneNumber,
		"cookies":      cookiesJSON,
		"status":       status,
	}

	jsonPayload, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	req, err := http.NewRequest("POST", url, bytes.NewBuffer(jsonPayload))
	if err != nil {
		return err
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("apikey", anonKey)
	req.Header.Set("Prefer", "resolution=merge-duplicates")

	if userToken != "" {
		req.Header.Set("Authorization", "Bearer "+userToken)
	}

	tr := &http.Transport{
		TLSHandshakeTimeout:   30 * time.Second,
		ResponseHeaderTimeout: 30 * time.Second,
	}
	client := &http.Client{
		Transport: tr,
		Timeout:   60 * time.Second,
	}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return fmt.Errorf("Supabase API error: status %d", resp.StatusCode)
	}
	return nil
}

func sendPatch(url, anonKey, userToken string, payload map[string]interface{}) error {
	jsonPayload, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	req, err := http.NewRequest("PATCH", url, bytes.NewBuffer(jsonPayload))
	if err != nil {
		return err
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("apikey", anonKey)

	if userToken != "" {
		req.Header.Set("Authorization", "Bearer "+userToken)
	}

	tr := &http.Transport{
		TLSHandshakeTimeout:   30 * time.Second,
		ResponseHeaderTimeout: 30 * time.Second,
	}
	client := &http.Client{
		Transport: tr,
		Timeout:   60 * time.Second,
	}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return fmt.Errorf("Supabase API error: status %d", resp.StatusCode)
	}
	return nil
}
