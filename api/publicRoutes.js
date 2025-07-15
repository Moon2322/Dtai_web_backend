import express from 'express';
import { db } from '../index.js';

const router = express.Router();

router.get('/noticias/publicas', async (req, res) => {
    try {
        const [noticias] = await db.execute(`
            SELECT 
                n.id,
                n.titulo,
                n.contenido,
                n.resumen,
                n.imagen_url,
                n.imagen_firebase_path,
                n.es_destacada,
                n.fecha_publicacion,
                n.vistas,
                cn.nombre as categoria_nombre,
                cn.color as categoria_color,
                CONCAT(u.nombre, ' ', u.apellido) as autor_nombre
            FROM noticias n
            INNER JOIN categorias_noticias cn ON n.categoria_id = cn.id
            INNER JOIN directivos d ON n.autor_id = d.id
            INNER JOIN usuarios u ON d.usuario_id = u.id
            WHERE n.publicada = 1 
            AND (n.fecha_expiracion IS NULL OR n.fecha_expiracion > NOW())
            ORDER BY n.es_destacada DESC, n.fecha_publicacion DESC
            LIMIT 20
        `);

        res.json({
            success: true,
            data: noticias
        });
    } catch (error) {
        console.error('Error al obtener noticias públicas:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

router.get('/noticias/publicas/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        const [noticias] = await db.execute(`
            SELECT 
                n.id,
                n.titulo,
                n.contenido,
                n.resumen,
                n.imagen_url,
                n.imagen_firebase_path,
                n.es_destacada,
                n.fecha_publicacion,
                n.vistas,
                cn.nombre as categoria_nombre,
                cn.color as categoria_color,
                CONCAT(u.nombre, ' ', u.apellido) as autor_nombre
            FROM noticias n
            INNER JOIN categorias_noticias cn ON n.categoria_id = cn.id
            INNER JOIN directivos d ON n.autor_id = d.id
            INNER JOIN usuarios u ON d.usuario_id = u.id
            WHERE n.id = ? 
            AND n.publicada = 1 
            AND (n.fecha_expiracion IS NULL OR n.fecha_expiracion > NOW())
        `, [id]);

        if (noticias.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Noticia no encontrada'
            });
        }

        res.json({
            success: true,
            data: noticias[0]
        });
    } catch (error) {
        console.error('Error al obtener noticia pública:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

router.post('/noticias/publicas/:id/vista', async (req, res) => {
    try {
        const { id } = req.params;
        
        const [noticia] = await db.execute(`
            SELECT id FROM noticias 
            WHERE id = ? AND publicada = 1
        `, [id]);

        if (noticia.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Noticia no encontrada'
            });
        }

        await db.execute(`
            UPDATE noticias 
            SET vistas = vistas + 1 
            WHERE id = ?
        `, [id]);

        res.json({
            success: true,
            message: 'Vista registrada'
        });
    } catch (error) {
        console.error('Error al registrar vista:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

router.get('/stats/publicas', async (req, res) => {
    try {
        const [stats] = await db.execute(`
            SELECT 
                (SELECT COUNT(*) FROM alumnos a 
                 INNER JOIN usuarios u ON a.usuario_id = u.id 
                 WHERE u.activo = 1 AND a.estado_alumno = 'activo') as estudiantes,
                (SELECT COUNT(*) FROM profesores p 
                 INNER JOIN usuarios u ON p.usuario_id = u.id 
                 WHERE u.activo = 1 AND p.activo = 1) as profesores
        `);

        res.json({
            success: true,
            data: stats[0]
        });
    } catch (error) {
        console.error('Error al obtener estadísticas públicas:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

export default router;