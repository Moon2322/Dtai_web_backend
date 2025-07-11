import express from 'express';
import { db } from '../index.js';

const router = express.Router();

router.get('/solicitudes-ayuda', async (req, res) => {
    try {
        const { search, grupo, cuatrimestre, estado } = req.query;
        
        let query = `
            SELECT sa.*, 
                   u.nombre, u.apellido, u.correo,
                   a.matricula, a.cuatrimestre_actual,
                   g.codigo as grupo_codigo,
                   d.id as directivo_asignado_id,
                   ud.nombre as directivo_nombre, ud.apellido as directivo_apellido
            FROM solicitudes_ayuda sa
            JOIN alumnos a ON sa.alumno_id = a.id
            JOIN usuarios u ON a.usuario_id = u.id
            LEFT JOIN alumnos_grupos ag ON a.id = ag.alumno_id AND ag.activo = TRUE
            LEFT JOIN grupos g ON ag.grupo_id = g.id
            LEFT JOIN directivos d ON sa.asignado_a = d.id
            LEFT JOIN usuarios ud ON d.usuario_id = ud.id
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
        
        if (estado && estado !== 'todos') {
            query += ` AND sa.estado = ?`;
            params.push(estado);
        }
        
        query += ` ORDER BY sa.fecha_solicitud DESC`;
        
        const [solicitudes] = await db.execute(query, params);
        
        res.json({
            success: true,
            data: solicitudes
        });
        
    } catch (error) {
        console.error('Error al obtener solicitudes de ayuda:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor',
            error: error.message
        });
    }
});

router.get('/solicitudes-ayuda/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        const [solicitud] = await db.execute(`
            SELECT sa.*, 
                   u.nombre, u.apellido, u.correo,
                   a.matricula, a.cuatrimestre_actual,
                   c.nombre as carrera_nombre,
                   g.codigo as grupo_codigo,
                   d.id as directivo_asignado_id,
                   ud.nombre as directivo_nombre, ud.apellido as directivo_apellido
            FROM solicitudes_ayuda sa
            JOIN alumnos a ON sa.alumno_id = a.id
            JOIN usuarios u ON a.usuario_id = u.id
            JOIN carreras c ON a.carrera_id = c.id
            LEFT JOIN alumnos_grupos ag ON a.id = ag.alumno_id AND ag.activo = TRUE
            LEFT JOIN grupos g ON ag.grupo_id = g.id
            LEFT JOIN directivos d ON sa.asignado_a = d.id
            LEFT JOIN usuarios ud ON d.usuario_id = ud.id
            WHERE sa.id = ?
        `, [id]);
        
        if (solicitud.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Solicitud no encontrada'
            });
        }
        
        const [chatHistorial] = await db.execute(`
            SELECT ca.*, u.nombre, u.apellido
            FROM chat_ayuda ca
            JOIN usuarios u ON ca.usuario_id = u.id
            WHERE ca.solicitud_id = ?
            ORDER BY ca.fecha_mensaje ASC
        `, [id]);
        
        res.json({
            success: true,
            data: {
                solicitud: solicitud[0],
                chatHistorial: chatHistorial
            }
        });
        
    } catch (error) {
        console.error('Error al obtener solicitud específica:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

router.post('/solicitudes-ayuda/:id/responder', async (req, res) => {
    try {
        const { id } = req.params;
        const { respuesta, estado } = req.body;
        const directivoId = req.user.userId;
        const [directivo] = await db.execute(`
            SELECT d.id FROM directivos d 
            WHERE d.usuario_id = ?
        `, [directivoId]);
        
        if (directivo.length === 0) {
            return res.status(403).json({
                success: false,
                message: 'No tienes permisos para realizar esta acción'
            });
        }
        
        const directivoDbId = directivo[0].id;
        
        const connection = await db.getConnection();
        await connection.beginTransaction();
        
        try {
            await connection.execute(`
                UPDATE solicitudes_ayuda SET
                    respuesta = ?, estado = ?, asignado_a = ?, fecha_respuesta = NOW()
                WHERE id = ?
            `, [respuesta, estado || 'en_atencion', directivoDbId, id]);
            
            await connection.execute(`
                INSERT INTO chat_ayuda (solicitud_id, usuario_id, mensaje, tipo_usuario)
                VALUES (?, ?, ?, 'directivo')
            `, [id, directivoId, respuesta]);
            
            await connection.commit();
            connection.release();
            
            res.json({
                success: true,
                message: 'Respuesta enviada exitosamente'
            });
            
        } catch (error) {
            await connection.rollback();
            connection.release();
            throw error;
        }
        
    } catch (error) {
        console.error('Error al responder solicitud:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});
router.patch('/solicitudes-ayuda/:id/estado', async (req, res) => {
    try {
        const { id } = req.params;
        const { estado } = req.body;
        
        await db.execute(
            'UPDATE solicitudes_ayuda SET estado = ? WHERE id = ?',
            [estado, id]
        );
        
        res.json({
            success: true,
            message: 'Estado actualizado exitosamente'
        });
        
    } catch (error) {
        console.error('Error al cambiar estado:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

router.get('/solicitudes-ayuda/stats/general', async (req, res) => {
    try {
        const [totalSolicitudes] = await db.execute(`
            SELECT COUNT(*) as total FROM solicitudes_ayuda
        `);
        
        const [solicitudesPendientes] = await db.execute(`
            SELECT COUNT(*) as total FROM solicitudes_ayuda 
            WHERE estado IN ('pendiente', 'en_atencion')
        `);
        
        const [solicitudesResueltas] = await db.execute(`
            SELECT COUNT(*) as total FROM solicitudes_ayuda 
            WHERE estado = 'resuelto'
        `);
        
        res.json({
            success: true,
            data: {
                totalSolicitudes: totalSolicitudes[0].total,
                solicitudesPendientes: solicitudesPendientes[0].total,
                solicitudesResueltas: solicitudesResueltas[0].total
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