import express from 'express';
import { db } from '../index.js';

const router = express.Router();

router.get('/encuestas/respuestas', async (req, res) => {
    try {
        const { search, grupo, cuatrimestre } = req.query;
        
        let query = `
            SELECT DISTINCT
                a.id,
                u.nombre,
                u.apellido,
                a.matricula,
                u.correo,
                g.codigo as grupo_codigo,
                a.cuatrimestre_actual,
                COUNT(DISTINCT re.encuesta_id) as encuestas_respondidas
            FROM alumnos a
            JOIN usuarios u ON a.usuario_id = u.id
            LEFT JOIN alumnos_grupos ag ON a.id = ag.alumno_id AND ag.activo = TRUE
            LEFT JOIN grupos g ON ag.grupo_id = g.id
            LEFT JOIN respuestas_encuesta re ON a.id = re.alumno_id
            WHERE a.estado_alumno = 'activo' AND u.activo = TRUE
        `;
        
        const params = [];
        
        if (search && search !== '') {
            query += ` AND (u.nombre LIKE ? OR u.apellido LIKE ? OR a.matricula LIKE ? OR u.correo LIKE ?)`;
            params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
        }
        
        if (grupo && grupo !== 'todos') {
            query += ` AND g.codigo = ?`;
            params.push(grupo);
        }
        
        if (cuatrimestre && cuatrimestre !== 'todos') {
            query += ` AND a.cuatrimestre_actual = ?`;
            params.push(cuatrimestre);
        }
        
        query += ` GROUP BY a.id, u.nombre, u.apellido, a.matricula, u.correo, g.codigo, a.cuatrimestre_actual`;
        query += ` ORDER BY u.apellido, u.nombre`;
        
        const [estudiantes] = await db.execute(query, params);
        
        res.json({
            success: true,
            data: estudiantes
        });
        
    } catch (error) {
        console.error('Error al obtener respuestas de encuestas:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor',
            error: error.message
        });
    }
});

router.get('/grupos', async (req, res) => {
    try {
        const [grupos] = await db.execute(`
            SELECT DISTINCT codigo
            FROM grupos 
            WHERE activo = TRUE 
            ORDER BY codigo
        `);
        
        res.json({
            success: true,
            data: grupos
        });
        
    } catch (error) {
        console.error('Error al obtener grupos:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});
router.get('/encuestas/estudiante/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        const [estudiante] = await db.execute(`
            SELECT a.*, u.nombre, u.apellido, u.correo, c.nombre as carrera_nombre,
                   g.codigo as grupo_codigo
            FROM alumnos a
            JOIN usuarios u ON a.usuario_id = u.id
            JOIN carreras c ON a.carrera_id = c.id
            LEFT JOIN alumnos_grupos ag ON a.id = ag.alumno_id AND ag.activo = TRUE
            LEFT JOIN grupos g ON ag.grupo_id = g.id
            WHERE a.id = ?
        `, [id]);
        
        if (estudiante.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Estudiante no encontrado'
            });
        }
        
        const [respuestas] = await db.execute(`
            SELECT e.titulo, e.tipo_encuesta, e.fecha_creacion,
                   pe.pregunta, pe.tipo_respuesta,
                   re.respuesta, re.fecha_respuesta
            FROM respuestas_encuesta re
            JOIN encuestas e ON re.encuesta_id = e.id
            JOIN preguntas_encuesta pe ON re.pregunta_id = pe.id
            WHERE re.alumno_id = ?
            ORDER BY e.fecha_creacion DESC, pe.orden
        `, [id]);
        
        res.json({
            success: true,
            data: {
                estudiante: estudiante[0],
                respuestas: respuestas
            }
        });
        
    } catch (error) {
        console.error('Error al obtener respuestas del estudiante:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});
router.get('/encuestas/estadisticas', async (req, res) => {
    try {
        const [totalRespuestas] = await db.execute(`
            SELECT COUNT(DISTINCT re.alumno_id) as total
            FROM respuestas_encuesta re
            JOIN alumnos a ON re.alumno_id = a.id
            JOIN usuarios u ON a.usuario_id = u.id
            WHERE a.estado_alumno = 'activo' AND u.activo = TRUE
        `);
        const [totalEstudiantes] = await db.execute(`
            SELECT COUNT(*) as total
            FROM alumnos a
            JOIN usuarios u ON a.usuario_id = u.id
            WHERE a.estado_alumno = 'activo' AND u.activo = TRUE
        `);
        
        const [encuestasActivas] = await db.execute(`
            SELECT COUNT(*) as total
            FROM encuestas
            WHERE activa = TRUE
        `);
        
        res.json({
            success: true,
            data: {
                estudiantesConRespuestas: totalRespuestas[0].total,
                totalEstudiantes: totalEstudiantes[0].total,
                encuestasActivas: encuestasActivas[0].total
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

export default router;