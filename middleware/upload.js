import multer from 'multer';
import { bucket } from '../firebase/config.js';
import path from 'path';

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Tipo de archivo no permitido'), false);
        }
    }
});

export const uploadToFirebase = async (file, folder = 'noticias') => {
    try {
        const fileName = `${folder}/${Date.now()}_${file.originalname}`;
        const fileUpload = bucket.file(fileName);
        
        const stream = fileUpload.createWriteStream({
            metadata: {
                contentType: file.mimetype,
            },
        });

        return new Promise((resolve, reject) => {
            stream.on('error', (error) => {
                reject(error);
            });

            stream.on('finish', async () => {
                try {
                    await fileUpload.makePublic();
                    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
                    resolve({
                        fileName: fileName,
                        publicUrl: publicUrl,
                        originalName: file.originalname
                    });
                } catch (error) {
                    reject(error);
                }
            });

            stream.end(file.buffer);
        });
    } catch (error) {
        throw error;
    }
};

export const deleteFromFirebase = async (fileName) => {
    try {
        const file = bucket.file(fileName);
        await file.delete();
        return true;
    } catch (error) {
        console.error('Error deleting file:', error);
        return false;
    }
};

export default upload;