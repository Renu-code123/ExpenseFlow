// Simple file upload service (Vercel safe version)
const fs = require('fs');
const path = require('path');
const os = require('os');

class FileUploadService {
  constructor() {
    // Use temporary directory (ONLY writable location in Vercel)
    this.uploadDir = path.join(os.tmpdir(), 'uploads');
    this.ensureUploadDir();
  }

  ensureUploadDir() {
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  async uploadFile(file) {
    try {
      this.validateFile(file);

      const filename = `${Date.now()}-${file.originalname}`;
      const filepath = path.join(this.uploadDir, filename);

      fs.writeFileSync(filepath, file.buffer);

      return {
        success: true,
        // Note: Files stored in /tmp are temporary (serverless limitation)
        url: `/tmp/uploads/${filename}`,
        filename,
        size: file.size
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  async deleteFile(filename) {
    try {
      const filepath = path.join(this.uploadDir, filename);

      if (fs.existsSync(filepath)) {
        fs.unlinkSync(filepath);
        return { success: true };
      }

      return { success: false, error: 'File not found' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  validateFile(file) {
    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/webp',
      'application/pdf',
      'text/csv',
      'application/json',
      'application/vnd.ms-excel'
    ];

    if (!allowedTypes.includes(file.mimetype)) {
      throw new Error(
        `Invalid file type: ${file.mimetype}. Allowed types: Images, PDF, CSV, JSON.`
      );
    }

    const maxSize = 10 * 1024 * 1024; // 10MB

    if (file.size > maxSize) {
      throw new Error('File size too large. Maximum size is 10MB.');
    }

    return true;
  }
}

module.exports = new FileUploadService();
