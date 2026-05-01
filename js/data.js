/**
 * data.js — Load and parse the actor-movie CSV.
 *
 * Returns:
 *   actors: Array<{ name: string, bits: number[] }>
 *     bits[j] = 1 if actor is in movies[j], else 0.
 *
 *   movies: Array<{ title: string }>
 *     Parallel to bits[]. Empty-titled columns are skipped.
 */

export async function loadData(csvPath) {
  const res = await fetch(csvPath);
  if (!res.ok) throw new Error(`Failed to load CSV: ${res.status}`);
  const text = await res.text();
  return parseCSV(text);
}

function parseCSVLine(line) {
  const fields = [];
  let cur = '';
  let inQuote = false;
  for (const ch of line) {
    if (ch === '"') {
      inQuote = !inQuote;
    } else if (ch === ',' && !inQuote) {
      fields.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  fields.push(cur);
  return fields;
}

function parseCSV(text) {
  const lines = text.split('\n');

  // Parse header: first field is empty (corner), rest are movie titles.
  // Build a mapping: rawColIndex → validMovieIndex (skip empty-titled cols).
  const header = parseCSVLine(lines[0]);
  const movies = [];
  const colToMovieIdx = {}; // rawColIndex → index in movies[]

  for (let c = 1; c < header.length; c++) {
    const title = header[c].trim();
    if (title) {
      colToMovieIdx[c] = movies.length;
      movies.push({ title });
    }
  }

  // Parse actor rows
  const actors = [];
  for (let r = 1; r < lines.length; r++) {
    const raw = lines[r];
    if (!raw.trim()) continue;
    const cols = parseCSVLine(raw);
    const name = cols[0].trim();
    if (!name) continue;

    // Build bits array parallel to movies[]
    const bits = new Array(movies.length).fill(0);
    for (const [cStr, mIdx] of Object.entries(colToMovieIdx)) {
      const c = Number(cStr);
      bits[mIdx] = parseInt(cols[c]) || 0;
    }

    actors.push({ name, bits });
  }

  return { actors, movies };
}
