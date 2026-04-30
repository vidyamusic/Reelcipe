package extractor

import (
	"fmt"
	"io"
	"net/http"
	"os"
)

// GetVideoData uses Supadata to extract the description/metadata of a Reel or Video
func GetVideoData(url string) (string, error) {
	apiKey := os.Getenv("SUPADATA_API_KEY")
	if apiKey == "" {
		return "", fmt.Errorf("SUPADATA_API_KEY is not set. Please add it to .env")
	}

	reqUrl := fmt.Sprintf("https://api.supadata.ai/v1/transcript?url=%s", url)
	req, err := http.NewRequest("GET", reqUrl, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("x-api-key", apiKey)

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		bodyBytes, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("supadata failed: status %d, body: %s", resp.StatusCode, string(bodyBytes))
	}

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}
	
	// We pass the entire JSON string to Gemini so it can extract title, description, transcript, etc.
	return string(bodyBytes), nil
}
