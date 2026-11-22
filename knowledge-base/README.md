# MINA TEACH AI Knowledge Base

This folder contains the versioned record contract and export/search tools.
Generated corpus files are kept under `generated-artifacts/knowledge-base/` so
large textbook extracts and user data are not added to Git or deployed with the
application.

## Build an export

From the project workspace, run:

```sh
npm run knowledge:build
```

The exporter reads the existing lesson and question tables and the PDFs in
`attached_assets/`. It does not alter source PDFs, publish drafts, approve
questions, write to the database, or train/update a model. It requires the
existing `DATABASE_URL` and the Poppler `pdfinfo`/`pdftotext` tools. Missing
configuration or extraction failures stop the export with an explicit error.

The output contains `records.jsonl`, `sources.json`, `report.md`, and
`metrics.json`. Each source PDF is SHA-256 checked; exact duplicates are listed
but emitted only once. Personal exam-result documents and unrelated documents
are listed as excluded and their page text is not exported.

## Search

```sh
npm run knowledge:search -- "your search terms"
```

This performs local lexical retrieval over the generated JSONL records. It is
an indexing/retrieval preparation step, not model training or a claim that the
assistant already consumes this index.

## Record rules

- `knowledge-base/schema.json` is the JSON Schema contract.
- Null metadata means the source did not provide a verified value.
- Source page numbers are one-based; unknown page numbers remain null.
- Database drafts/rejections and AI-generated questions remain labeled and are
  not eligible for student-facing retrieval.
- Textbook PDF pages are source excerpts, not proof that a course's full
  curriculum has been mapped or reviewed.
