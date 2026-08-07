-- extract_only deployments keep the parsed text and discard the file, so an
-- attachment can legitimately have no object behind it.
ALTER TABLE "attachment" ALTER COLUMN "s3_key" DROP NOT NULL;
