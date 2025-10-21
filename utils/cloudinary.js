import { v2 as cloudinary } from "cloudinary";
import dotenv from "dotenv";

dotenv.config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// This function uploads an image (base64 or file path) to Cloudinary
export const uploadToCloudinary = async (imageBase64) => {
  try {
    const result = await cloudinary.uploader.upload(imageBase64, {
      folder: "palmport_batches", // optional: creates a folder in your Cloudinary account
      resource_type: "image",
    });
    return result.secure_url;
  } catch (error) {
    console.error("Cloudinary upload failed:", error);
    throw new Error("Image upload failed");
  }
};
