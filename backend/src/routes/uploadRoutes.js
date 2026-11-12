import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import { uploadLimiter } from '../middleware/rateLimiter.js';
import { persistUploadedImage, uploadSingleImage } from '../middleware/upload.js';

const router = Router();

/**
 * POST /api/uploads/image
 * Protected image upload endpoint supporting avatar, logo, cover, and expedition images.
 * Uses Supabase Storage when SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set,
 * otherwise stores safely on local disk under /uploads.
 */
router.post('/image', protect, uploadLimiter, (req, res, next) => {
  uploadSingleImage(req, res, async (err) => {
    try {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          err.statusCode = 400;
          err.message = 'Image size must be 2 MB or less.';
        } else if (!err.statusCode) {
          err.statusCode = 400;
        }
        return next(err);
      }

      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'No image file provided. Use form field "image".',
        });
      }

      const persisted = await persistUploadedImage(req.file, req.user.id);

      return res.status(201).json({
        success: true,
        message: 'Image uploaded successfully.',
        data: persisted,
      });
    } catch (uploadErr) {
      return next(uploadErr);
    }
  });
});

export default router;
