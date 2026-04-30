package extractor

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strings"

	"github.com/google/generative-ai-go/genai"
	"google.golang.org/api/option"
)

var geminiClient *genai.Client

type Ingredient struct {
	ItemName string `json:"item_name"`
	Quantity string    `json:"quantity"`
	Unit     string `json:"unit"`
}

type Step struct {
	StepNumber  int    `json:"step_number"`
	Instruction string `json:"instruction"`
}

type GeminiResponse struct {
	Title        string       `json:"title"`
	ThumbnailURL string       `json:"thumbnail_url"`
	Ingredients  []Ingredient `json:"ingredients"`
	Steps        []Step       `json:"steps"`
}

// InitGemini initializes the global Gemini client
func InitGemini() error {
	apiKey := os.Getenv("GEMINI_API_KEY")
	if apiKey == "" {
		return fmt.Errorf("GEMINI_API_KEY is not set")
	}

	ctx := context.Background()
	client, err := genai.NewClient(ctx, option.WithAPIKey(apiKey))
	if err != nil {
		return err
	}
	geminiClient = client
	return nil
}

// ParseRecipeData calls Gemini to parse the unstructured text into JSON
func ParseRecipeData(rawText string) (*GeminiResponse, error) {
	if geminiClient == nil {
		return nil, fmt.Errorf("Gemini client not initialized")
	}

	ctx := context.Background()
	model := geminiClient.GenerativeModel("gemini-2.5-pro")

	// We force the model to output JSON
	model.ResponseMIMEType = "application/json"

	prompt := fmt.Sprintf(`
You are a culinary AI assistant. Your task is to extract recipe ingredients, steps, and metadata from the following video data (JSON format usually).

Instructions:
1. Extract the name of the recipe (Title).
2. Extract any thumbnail URL if present in the data.
3. Extract the exact ingredients, quantities, and units.
4. Extract the preparation steps sequentially.
5. Output strict JSON matching the following schema:
{
  "title": "String",
  "thumbnail_url": "String (URL, if found, else empty)",
  "ingredients": [
    {
      "item_name": "String (e.g. Tomato, Olive Oil)",
      "quantity": "Number or fraction as string (e.g. 2, 1/2)",
      "unit": "String (e.g. pcs, tbsp, cups. use 'to taste' if not specified)"
    }
  ],
  "steps": [
    {
      "step_number": Number,
      "instruction": "String"
    }
  ]
}

Text to process:
%s
`, rawText)

	resp, err := model.GenerateContent(ctx, genai.Text(prompt))
	if err != nil {
		return nil, fmt.Errorf("Gemini API error: %v", err)
	}

	if len(resp.Candidates) == 0 || len(resp.Candidates[0].Content.Parts) == 0 {
		return nil, fmt.Errorf("Empty response from Gemini")
	}

	part := resp.Candidates[0].Content.Parts[0]
	var jsonStr string
	if txt, ok := part.(genai.Text); ok {
		jsonStr = string(txt)
	} else {
		return nil, fmt.Errorf("Unexpected response type from Gemini")
	}

	// Remove markdown code blocks if any (e.g. ```json ... ```)
	jsonStr = strings.TrimPrefix(jsonStr, "```json\n")
	jsonStr = strings.TrimSuffix(jsonStr, "\n```")

	var result GeminiResponse
	err = json.Unmarshal([]byte(jsonStr), &result)
	if err != nil {
		return nil, fmt.Errorf("Failed to parse JSON from Gemini: %v\nRaw Output: %s", err, jsonStr)
	}

	return &result, nil
}
