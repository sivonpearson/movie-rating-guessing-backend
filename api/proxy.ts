import type { VercelRequest, VercelResponse } from "@vercel/node";
import { generate, count } from "random-words";

const base_url = `https://www.omdbapi.com`;

const encodeURL = (url: string, params: Object) => {
  const ending = Object.entries(params)
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(value)}`
    )
    .join("&");
  return url + "/?" + ending;
};

const generateRandomString = () => {
  // using 'random-words'
  let random_words = String(generate({ minLength: 4 })); // ensure this word isnt too short
  return random_words;
};

// parameters for query by search
const get_bysearch_params = (api_key: string, movie_name: string) => {
  return {
    apikey: api_key,
    s: movie_name,
    type: "movie",
  };
};

// parameters for query by id
const get_byid_params = (api_key: string, imdb_id: string) => {
  return {
    apikey: api_key,
    i: imdb_id,
    plot: "full",
  };
};

const sleep = (delay: number) =>
  new Promise((resolve) => setTimeout(resolve, delay));

// TODO: compile list of IMDB id's

const MAX_RETRIES = 5;

// OMDb API query
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    // Allow cross-origin requests from localhost frontend
    res.setHeader("Access-Control-Allow-Origin", "http://localhost:5173");
    res.setHeader("Access-Control-Allow-Methods", "GET");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    const apiKey = process.env.OMDB_API_KEY;

    if (!apiKey) {
      return res
        .status(500)
        .json({ error: "API key is missing in server configuration" });
    }

    for (let r = 0; r < MAX_RETRIES; r++) {
      const random_word = generateRandomString();

      console.log(random_word);

      await sleep(3000);

      const search_response = await fetch(
        encodeURL(base_url, get_bysearch_params(apiKey, random_word))
      );

      console.log(search_response);

      if (!search_response.ok) {
        return res
          .status(search_response.status)
          .json({ error: "Failed to fetch data from external API" });
      }

      await sleep(1000);

      const searchData = await search_response.json();

      if (searchData.Response === "False") {
        return res.status(404).json({ error: "Movie not found" });
      }

      const movies = searchData.Search;

      console.log(movies);

      if (!movies) continue;

      const filtered_movies = movies.filter(
        (movie: { Poster: string }) => movie.Poster !== "N/A"
      );

      if (filtered_movies) {
        const movie = movies[Math.floor(Math.random() * movies.length)];

        const imdb_response = await fetch(
          encodeURL(base_url, get_byid_params(apiKey, movie.imdbID))
        );

        if (!imdb_response.ok) {
          return res
            .status(imdb_response.status)
            .json({ error: "Failed to fetch movie details from OMDb" });
        }

        const imdbData = await imdb_response.json();

        // the movie may be unrated, which is unwanted
        if (imdbData.imdbRating === "N/A") {
          continue;
        }

        console.log(imdbData);

        /*
        We want:
        - Title
        - Year
        - Poster
        - Genre
        - Plot
        - IMDb score (1-10)
        - Rated
        - Director
        - Writer
        - Actors
        - Runtime
        */

        return res.status(200).json(imdbData);
      }
    }
    throw new Error("Exceeded max retries.");
  } catch (error) {
    console.error("Server error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}
