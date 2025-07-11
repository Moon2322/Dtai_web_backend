import express from 'express';
import { db } from '../index.js';
import { verifyToken } from '../middleware/auth.js';

const router = express.Router();

router.use(verifyToken);
router.get('/directivo/stats', async (req, res) => {
    try {
        const [estudiantes] = await db.execute(`
            SELECT COUNT(*) as total 
            FROM alumnos a 
            JOIN usuarios u ON a.usuario_id = u.id 
            WHERE a.estado_alumno = 'activo' AND u.activo = TRUE
        `);
        const [profesores] = await db.execute(`
            SELECT COUNT(*) as total 
            FROM profesores p 
            JOIN usuarios u ON p.usuario_id = u.id 
            WHERE p.activo = TRUE AND u.activo = TRUE
        `);
        const [asignaturas] = await db.execute(`
            SELECT COUNT(*) as total 
            FROM asignaturas 
            WHERE activa = TRUE
        `);
        const [noticias] = await db.execute(`
            SELECT COUNT(*) as total 
            FROM noticias 
            WHERE publicada = FALSE
        `);
        const [reportes] = await db.execute(`
            SELECT COUNT(*) as total 
            FROM reportes_riesgo 
            WHERE estado IN ('abierto', 'en_proceso')
        `);
        const [solicitudes] = await db.execute(`
            SELECT COUNT(*) as total 
            FROM solicitudes_ayuda 
            WHERE estado IN ('pendiente', 'en_atencion')
        `);

        res.json({
            success: true,
            data: {
                estudiantes: estudiantes[0].total,
                profesores: profesores[0].total,
                asignaturas: asignaturas[0].total,
                noticiasRevisar: noticias[0].total,
                reportesRiesgo: reportes[0].total,
                solicitudesAyuda: solicitudes[0].total
            }
        });

    } catch (error) {
        console.error('Error al obtener estadísticas:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});
router.get('/directivo/noticias-pendientes', async (req, res) => {
    try {
        const [noticias] = await db.execute(`
            SELECT n.*, u.nombre, u.apellido, c.nombre as categoria_nombre
            FROM noticias n
            JOIN directivos d ON n.autor_id = d.id
            JOIN usuarios u ON d.usuario_id = u.id
            JOIN categorias_noticias c ON n.categoria_id = c.id
            WHERE n.publicada = FALSE
            ORDER BY n.fecha_creacion DESC
            LIMIT 5
        `);

        res.json({
            success: true,
            data: noticias
        });

    } catch (error) {
        console.error('Error al obtener noticias pendientes:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});
router.get('/directivo/reportes-recientes', async (req, res) => {
    try {
        const [reportes] = await db.execute(`
            SELECT rr.*, 
                   ua.nombre as alumno_nombre, ua.apellido as alumno_apellido,
                   up.nombre as profesor_nombre, up.apellido as profesor_apellido,
                   a.matricula
            FROM reportes_riesgo rr
            JOIN alumnos al ON rr.alumno_id = al.id
            JOIN usuarios ua ON al.usuario_id = ua.id
            JOIN profesores p ON rr.profesor_id = p.id
            JOIN usuarios up ON p.usuario_id = up.id
            JOIN alumnos a ON rr.alumno_id = a.id
            WHERE rr.estado IN ('abierto', 'en_proceso')
            ORDER BY rr.fecha_reporte DESC
            LIMIT 10
        `);

        res.json({
            success: true,
            data: reportes
        });

    } catch (error) {
        console.error('Error al obtener reportes recientes:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

export default router;