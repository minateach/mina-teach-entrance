import sharp from "sharp";

export const maxImageUploadBytes = 5 * 1024 * 1024;
export const maxImagePixels = 20_000_000;
export const maxImageSide = 8_192;

export class ImageInputError extends Error {
  constructor(message, code = "INVALID_IMAGE") {
    super(message);
    this.name = "ImageInputError";
    this.code = code;
    this.statusCode = 400;
  }
}

const acceptedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

function mimeForFormat(format) {
  if (format === "jpg" || format === "jpeg") return "image/jpeg";
  if (format === "png") return "image/png";
  if (format === "webp") return "image/webp";
  return "";
}

export async function normalizeImageDataUrl(dataUrl) {
  if (typeof dataUrl !== "string") {
    throw new ImageInputError("Choose a JPG, PNG, or WEBP image.");
  }
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/i.exec(dataUrl);
  if (!match || !acceptedMimeTypes.has(match[1].toLowerCase())) {
    throw new ImageInputError("Choose a valid JPG, PNG, or WEBP image.");
  }
  const encoded = match[2];
  if (encoded.length > Math.ceil(maxImageUploadBytes * 4 / 3) + 4) {
    throw new ImageInputError("Images must be 5 MB or smaller.", "IMAGE_TOO_LARGE");
  }
  const bytes = Buffer.from(encoded, "base64");
  const canonicalBase64 = bytes.toString("base64").replace(/=+$/, "");
  if (!bytes.length || canonicalBase64 !== encoded.replace(/=+$/, "")) {
    throw new ImageInputError("The uploaded image data is malformed.");
  }
  return normalizeImageBuffer(bytes, match[1].toLowerCase());
}

export async function normalizeImageBuffer(bytes, declaredMimeType = "") {
  if (!Buffer.isBuffer(bytes) || !bytes.length) {
    throw new ImageInputError("The image data is empty.");
  }
  if (bytes.length > maxImageUploadBytes) {
    throw new ImageInputError("Images must be 5 MB or smaller.", "IMAGE_TOO_LARGE");
  }
  try {
    const image = sharp(bytes, { failOn: "error", limitInputPixels: maxImagePixels });
    const metadata = await image.metadata();
    const actualMimeType = mimeForFormat(metadata.format);
    if (!acceptedMimeTypes.has(actualMimeType) || (declaredMimeType && actualMimeType !== declaredMimeType)) {
      throw new ImageInputError("The file contents do not match a supported image type.");
    }
    const width = Number(metadata.width);
    const height = Number(metadata.height);
    if (
      !Number.isInteger(width) ||
      !Number.isInteger(height) ||
      width < 16 ||
      height < 16 ||
      width > maxImageSide ||
      height > maxImageSide ||
      width * height > maxImagePixels
    ) {
      throw new ImageInputError("The image dimensions are outside the supported limits.", "IMAGE_DIMENSIONS_INVALID");
    }
    if ((metadata.pages || 1) > 1) {
      throw new ImageInputError("Animated images are not supported. Choose a still image.");
    }
    const normalized = await image
      .rotate()
      .resize({ width: 2_048, height: 2_048, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 86, mozjpeg: true })
      .toBuffer();
    if (normalized.length > maxImageUploadBytes) {
      throw new ImageInputError("The processed image is too large. Choose a smaller image.", "IMAGE_TOO_LARGE");
    }
    const outputMetadata = await sharp(normalized).metadata();
    return {
      buffer: normalized,
      data: normalized.toString("base64"),
      dataUrl: `data:image/jpeg;base64,${normalized.toString("base64")}`,
      mimeType: "image/jpeg",
      width: Number(outputMetadata.width) || width,
      height: Number(outputMetadata.height) || height,
      originalBytes: bytes.length,
    };
  } catch (error) {
    if (error instanceof ImageInputError) throw error;
    throw new ImageInputError("This image could not be decoded safely. Try another JPG, PNG, or WEBP file.");
  }
}

