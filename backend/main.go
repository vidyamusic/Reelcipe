package main

import (
	"log"
	"os"

	"github.com/cookbook/worker/extractor"
	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/logger"
	"github.com/joho/godotenv"
)

func main() {
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found, relying on environment variables")
	}

	app := fiber.New()
	app.Use(logger.New())
	app.Use(cors.New())

	// Initialize Gemini Client
	err := extractor.InitGemini()
	if err != nil {
		log.Fatalf("Failed to initialize Gemini: %v", err)
	}

	app.Post("/api/extract", handleExtract)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	log.Printf("Starting server on port %s", port)
	app.Listen(":" + port)
}

type ExtractRequest struct {
	RecipeID  string `json:"recipe_id"`
	ReelURL   string `json:"reel_url"`
	UserToken string `json:"user_token"`
}

func handleExtract(c *fiber.Ctx) error {
	var req ExtractRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}

	if req.RecipeID == "" || req.ReelURL == "" || req.UserToken == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Missing required fields"})
	}

	// Update status to 'extracting'
	go processExtraction(req)

	return c.JSON(fiber.Map{"status": "Extraction started", "recipe_id": req.RecipeID})
}

func processExtraction(req ExtractRequest) {
	// 1. Get raw text using Supadata
	rawText, err := extractor.GetVideoData(req.ReelURL)
	if err != nil {
		log.Printf("supadata error for %s: %v", req.RecipeID, err)
		extractor.UpdateRecipeStatus(req.RecipeID, req.UserToken, "failed", err.Error(), nil, nil, "", "")
		return
	}

	// 2. Parse ingredients using Gemini
	recipeData, err := extractor.ParseRecipeData(rawText)
	if err != nil {
		log.Printf("Gemini error for %s: %v", req.RecipeID, err)
		extractor.UpdateRecipeStatus(req.RecipeID, req.UserToken, "failed", "AI extraction failed", nil, nil, rawText, "")
		return
	}

	// 3. Update Supabase with success
	err = extractor.UpdateRecipeStatus(req.RecipeID, req.UserToken, "completed", "", recipeData.Ingredients, recipeData.Steps, rawText, recipeData.ThumbnailURL)
	if err != nil {
		log.Printf("Supabase update error for %s: %v", req.RecipeID, err)
	}
    
    // Also update the title
    if recipeData.Title != "" {
        extractor.UpdateRecipeTitle(req.RecipeID, req.UserToken, recipeData.Title)
    }
}
