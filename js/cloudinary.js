
const CLOUDINARY_CLOUD_NAME = "ka4h4lpk";
const CLOUDINARY_UPLOAD_PRESET = "egmon_chat";
const CLOUDINARY_MAX_BYTES = 5 * 1024 * 1024;

const IMAGE_URL_PATTERN =
  /^https:\/\/res\.cloudinary\.com\/[a-z0-9_-]+\/(image|video)\/upload\/.+/i;

function isImageFile(file) {
  return Boolean(file && file.type && file.type.startsWith("image/"));
}

function isImageMessageContent(content) {
  if (!content || typeof content !== "string") return false;
  const trimmed = content.trim();
  if (!trimmed) return false;
  if (IMAGE_URL_PATTERN.test(trimmed)) return true;
  return /^https:\/\/.+\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i.test(trimmed);
}

function getMessagePreviewLabel(content) {
  if (isImageMessageContent(content)) return "Photo";
  return content;
}

async function uploadImageToCloudinary(file) {
  if (!isImageFile(file)) {
    throw new Error("Seules les images sont acceptées (JPG, PNG, GIF, WebP).");
  }

  if (file.size > CLOUDINARY_MAX_BYTES) {
    throw new Error("Image trop lourde (maximum 5 Mo).");
  }

  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
  formData.append("folder", "egmon-chat");

  let response;

  try {
    response = await fetch(
      "https://api.cloudinary.com/v1_1/" + CLOUDINARY_CLOUD_NAME + "/image/upload",
      {
        method: "POST",
        body: formData,
      }
    );
  } catch (error) {
    throw new Error("Impossible d'envoyer l'image. Vérifiez votre connexion.");
  }

  let data = {};

  try {
    data = await response.json();
  } catch (error) {
    data = {};
  }

  if (!response.ok || !data.secure_url) {
    throw new Error(data.error?.message || "Échec de l'upload Cloudinary.");
  }

  return data.secure_url;
}

const Cloudinary = {
  uploadImageToCloudinary,
  isImageMessageContent,
  isImageFile,
  getMessagePreviewLabel,
};
