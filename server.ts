import express, { Request, Response } from "express";
import multer from "multer";
import axios from "axios";
import * as path from "path";
import * as fs from "fs";

const app = express();
const upload = multer({ dest: "uploads/" });

app.use(express.json());
app.use(express.static("public"));

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || "";
const GOOGLE_CX = process.env.GOOGLE_CX || "";

interface PillResult {
  title: string;
  imageUrl: string;
  sourceUrl: string;
  sourceDomain: string;
  snippet: string;
}

const EXCLUDE_KEYWORDS = [
  "structure", "formula", "molecular", "chemical", "skeleton",
  "diagram", "2d", "3d", "molecule", "smiles", "compound",
];

function looksLikeChemicalImage(title: string, snippet: string): boolean {
  const text = `${title} ${snippet}`.toLowerCase();
  return EXCLUDE_KEYWORDS.some((kw) => text.includes(kw));
}

app.post(
  "/api/identify",
  upload.single("image"),
  async (req: Request, res: Response) => {
    try {
      const description: string = req.body.description || "";
      const imagePath: string | undefined = req.file?.path;

      if (!description && !imagePath) {
        return res.status(400).json({ error: "Please provide a description or image." });
      }

      if (!GOOGLE_API_KEY || !GOOGLE_CX) {
        return res.status(500).json({
          error: "Google API credentials not configured. See README.md for setup instructions.",
        });
      }

      const baseQuery = description || "pill tablet capsule";
      const searchQuery = `${baseQuery} pill tablet photo -structure -formula -molecular`;

      const googleRes = await axios.get(
        "https://www.googleapis.com/customsearch/v1",
        {
          params: {
            key: GOOGLE_API_KEY,
            cx: GOOGLE_CX,
            q: searchQuery,
            searchType: "image",
            imgType: "photo",
            safe: "active",
            num: 10,
          },
        }
      );

      const items = googleRes.data.items || [];

      const results: PillResult[] = items
        .filter((item: any) => {
          const title: string = item.title || "";
          const snippet: string = item.snippet || "";
          return !looksLikeChemicalImage(title, snippet);
        })
        .slice(0, 6)
        .map((item: any) => ({
          title: item.title,
          imageUrl: item.link,
          sourceUrl: item.image?.contextLink || item.displayLink,
          sourceDomain: item.displayLink,
          snippet: item.snippet || "",
        }));

      if (imagePath && fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }

      res.json({ results, query: searchQuery });
    } catch (err: any) {
      console.error(err?.response?.data || err.message);
      res.status(500).json({ error: "Search failed. Please try again." });
    }
  }
);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Pill Identifier running on port ${PORT}`));
