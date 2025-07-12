import express from 'express';
import { db } from '../index.js';
import { verifyToken } from '../middleware/auth.js';

const router = express.Router();

router.get('/estudiante/calificaciones/por-cuatrimestre', verifyToken, async (req, res) => {
    try {
        const usuarioId = req.userId;
        const { cuatrimestre } = req.query;
        
        const [alumnoRows] = await db.execute(`
            SELECT id FROM alumnos WHERE usuario_id = ?
        `, [usuarioId]);

        if (alumnoRows.length === 0) {
            return res.status(404).json({ error: 'Estudiante no encontrado' });
        }

        const alumnoId = alumnoRows[0].id;
        let query = `
            SELECT 
                c.id,
                c.parcial_1,
                c.parcial_2,
                c.parcial_3,
                c.calificacion_ordinario,
                c.calificacion_extraordinario,
                c.calificacion_final,
                c.estatus,
                c.observaciones,
                c.ciclo_escolar,
                c.fecha_captura,
                a.nombre AS asignatura,
                a.codigo AS codigo_asignatura,
                a.cuatrimestre,
                CONCAT(u.nombre, ' ', u.apellido) AS profesor
            FROM calificaciones c
            INNER JOIN asignaturas a ON c.asignatura_id = a.id
            INNER JOIN profesores p ON c.profesor_id = p.id
            INNER JOIN usuarios u ON p.usuario_id = u.id
            WHERE c.alumno_id = ?
        `;
        
        const params = [alumnoId];
        
        if (cuatrimestre) {
            query += ` AND a.cuatrimestre = ?`;
            params.push(cuatrimestre);
        }
        
        query += ` ORDER BY a.cuatrimestre, a.nombre`;
        
        const [rows] = await db.execute(query, params);
        res.json(rows);
    } catch (error) {
        console.error('Error al obtener calificaciones por cuatrimestre:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

router.get('/estudiante/calificaciones/estadisticas', verifyToken, async (req, res) => {
    try {
        const usuarioId = req.userId;
        
        const [alumnoRows] = await db.execute(`
            SELECT id FROM alumnos WHERE usuario_id = ?
        `, [usuarioId]);

        if (alumnoRows.length === 0) {
            return res.status(404).json({ error: 'Estudiante no encontrado' });
        }

        const alumnoId = alumnoRows[0].id;

        const [stats] = await db.execute(`
            SELECT 
                COUNT(*) as total_materias,
                COUNT(CASE WHEN estatus = 'aprobado' THEN 1 END) as materias_aprobadas,
                COUNT(CASE WHEN estatus = 'reprobado' THEN 1 END) as materias_reprobadas,
                COUNT(CASE WHEN estatus = 'cursando' THEN 1 END) as materias_cursando,
                COUNT(CASE WHEN estatus = 'extraordinario' THEN 1 END) as materias_extraordinario,
                AVG(CASE WHEN calificacion_final IS NOT NULL AND calificacion_final > 0 THEN calificacion_final END) as promedio_general
            FROM calificaciones
            WHERE alumno_id = ?
        `, [alumnoId]);


        res.json(stats[0]);
    } catch (error) {
        console.error('Error al obtener estadísticas:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

router.get('/estudiante/calificaciones/historico', verifyToken, async (req, res) => {
    try {
        const usuarioId = req.userId;
        
        const [alumnoRows] = await db.execute(`
            SELECT id FROM alumnos WHERE usuario_id = ?
        `, [usuarioId]);

        if (alumnoRows.length === 0) {
            return res.status(404).json({ error: 'Estudiante no encontrado' });
        }

        const alumnoId = alumnoRows[0].id;

        const [rows] = await db.execute(`
            SELECT 
                c.ciclo_escolar,
                a.cuatrimestre,
                COUNT(*) as total_materias,
                COUNT(CASE WHEN c.estatus = 'aprobado' THEN 1 END) as materias_aprobadas,
                AVG(CASE WHEN c.calificacion_final IS NOT NULL AND c.calificacion_final > 0 THEN c.calificacion_final END) as promedio_cuatrimestre
            FROM calificaciones c
            INNER JOIN asignaturas a ON c.asignatura_id = a.id
            WHERE c.alumno_id = ?
            GROUP BY c.ciclo_escolar, a.cuatrimestre
            ORDER BY c.ciclo_escolar DESC, a.cuatrimestre
        `, [alumnoId]);

        res.json(rows);
    } catch (error) {
        console.error('Error al obtener histórico:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

router.get('/estudiante/calificaciones/detalle/:asignaturaId', verifyToken, async (req, res) => {
    try {
        const usuarioId = req.userId;
        const { asignaturaId } = req.params;
        
        const [alumnoRows] = await db.execute(`
            SELECT id FROM alumnos WHERE usuario_id = ?
        `, [usuarioId]);

        if (alumnoRows.length === 0) {
            return res.status(404).json({ error: 'Estudiante no encontrado' });
        }

        const alumnoId = alumnoRows[0].id;

        const [rows] = await db.execute(`
            SELECT 
                c.*,
                a.nombre AS asignatura,
                a.codigo AS codigo_asignatura,
                a.cuatrimestre,
                a.descripcion AS descripcion_asignatura,
                CONCAT(u.nombre, ' ', u.apellido) AS profesor,
                u.correo AS correo_profesor
            FROM calificaciones c
            INNER JOIN asignaturas a ON c.asignatura_id = a.id
            INNER JOIN profesores p ON c.profesor_id = p.id
            INNER JOIN usuarios u ON p.usuario_id = u.id
            WHERE c.alumno_id = ? AND c.asignatura_id = ?
        `, [alumnoId, asignaturaId]);

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Calificación no encontrada' });
        }

        res.json(rows[0]);
    } catch (error) {
        console.error('Error al obtener detalle de calificación:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

router.get('/estudiante/calificaciones/materias-pendientes', verifyToken, async (req, res) => {
    try {
        const usuarioId = req.userId;
        
        const [alumnoRows] = await db.execute(`
            SELECT id, cuatrimestre_actual FROM alumnos WHERE usuario_id = ?
        `, [usuarioId]);

        if (alumnoRows.length === 0) {
            return res.status(404).json({ error: 'Estudiante no encontrado' });
        }

        const alumnoId = alumnoRows[0].id;
        const cuatrimestreActual = alumnoRows[0].cuatrimestre_actual;

        const [rows] = await db.execute(`
            SELECT 
                a.id,
                a.nombre AS asignatura,
                a.codigo,
                a.cuatrimestre,
                CASE 
                    WHEN c.id IS NULL THEN 'pendiente'
                    ELSE c.estatus
                END as estatus,
                c.calificacion_final
            FROM asignaturas a
            LEFT JOIN calificaciones c ON a.id = c.asignatura_id AND c.alumno_id = ?
            WHERE a.cuatrimestre <= ? 
            AND (c.estatus IS NULL OR c.estatus IN ('reprobado', 'cursando'))
            AND a.activa = 1
            ORDER BY a.cuatrimestre, a.nombre
        `, [alumnoId, cuatrimestreActual]);

        res.json(rows);
    } catch (error) {
        console.error('Error al obtener materias pendientes:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

router.get('/profesor/calificaciones/grupo/:grupoId', verifyToken, async (req, res) => {
    try {
        const usuarioId = req.userId;
        const { grupoId } = req.params;
        
        const [profesorRows] = await db.execute(`
            SELECT id FROM profesores WHERE usuario_id = ?
        `, [usuarioId]);

        if (profesorRows.length === 0) {
            return res.status(403).json({ error: 'Acceso denegado' });
        }

        const profesorId = profesorRows[0].id;

        const [rows] = await db.execute(`
            SELECT 
                c.id,
                c.parcial_1,
                c.parcial_2,
                c.parcial_3,
                c.calificacion_ordinario,
                c.calificacion_extraordinario,
                c.calificacion_final,
                c.estatus,
                c.observaciones,
                CONCAT(u.nombre, ' ', u.apellido) AS alumno,
                al.matricula,
                a.nombre AS asignatura
            FROM calificaciones c
            INNER JOIN alumnos al ON c.alumno_id = al.id
            INNER JOIN usuarios u ON al.usuario_id = u.id
            INNER JOIN asignaturas a ON c.asignatura_id = a.id
            WHERE c.grupo_id = ? AND c.profesor_id = ?
            ORDER BY u.apellido, u.nombre
        `, [grupoId, profesorId]);

        res.json(rows);
    } catch (error) {
        console.error('Error al obtener calificaciones del grupo:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

router.put('/profesor/calificaciones/:calificacionId', verifyToken, async (req, res) => {
    try {
        const usuarioId = req.userId;
        const { calificacionId } = req.params;
        const { 
            parcial_1, 
            parcial_2, 
            parcial_3, 
            calificacion_ordinario,
            calificacion_extraordinario,
            calificacion_final,
            estatus,
            observaciones 
        } = req.body;

        const [profesorRows] = await db.execute(`
            SELECT id FROM profesores WHERE usuario_id = ?
        `, [usuarioId]);

        if (profesorRows.length === 0) {
            return res.status(403).json({ error: 'Acceso denegado' });
        }

        const profesorId = profesorRows[0].id;

        const [calificacionRows] = await db.execute(`
            SELECT id FROM calificaciones WHERE id = ? AND profesor_id = ?
        `, [calificacionId, profesorId]);

        if (calificacionRows.length === 0) {
            return res.status(404).json({ error: 'Calificación no encontrada o sin permisos' });
        }

        await db.execute(`
            UPDATE calificaciones 
            SET parcial_1 = ?, parcial_2 = ?, parcial_3 = ?,
                calificacion_ordinario = ?, calificacion_extraordinario = ?,
                calificacion_final = ?, estatus = ?, observaciones = ?
            WHERE id = ?
        `, [
            parcial_1, parcial_2, parcial_3,
            calificacion_ordinario, calificacion_extraordinario,
            calificacion_final, estatus, observaciones,
            calificacionId
        ]);

        res.json({ message: 'Calificación actualizada exitosamente' });
    } catch (error) {
        console.error('Error al actualizar calificación:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

router.post('/profesor/calificaciones', verifyToken, async (req, res) => {
    try {
        const usuarioId = req.userId;
        const {
            alumno_id,
            asignatura_id,
            grupo_id,
            parcial_1,
            parcial_2,
            parcial_3,
            calificacion_ordinario,
            calificacion_extraordinario,
            calificacion_final,
            estatus,
            observaciones,
            ciclo_escolar
        } = req.body;

        const [profesorRows] = await db.execute(`
            SELECT id FROM profesores WHERE usuario_id = ?
        `, [usuarioId]);

        if (profesorRows.length === 0) {
            return res.status(403).json({ error: 'Acceso denegado' });
        }

        const profesorId = profesorRows[0].id;

        const [existeCalificacion] = await db.execute(`
            SELECT id FROM calificaciones 
            WHERE alumno_id = ? AND asignatura_id = ? AND grupo_id = ? AND ciclo_escolar = ?
        `, [alumno_id, asignatura_id, grupo_id, ciclo_escolar]);

        if (existeCalificacion.length > 0) {
            return res.status(400).json({ 
                error: 'Ya existe una calificación para este alumno en esta materia y ciclo escolar' 
            });
        }

        const [result] = await db.execute(`
            INSERT INTO calificaciones (
                alumno_id, asignatura_id, grupo_id, profesor_id,
                parcial_1, parcial_2, parcial_3,
                calificacion_ordinario, calificacion_extraordinario, calificacion_final,
                estatus, observaciones, ciclo_escolar
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            alumno_id, asignatura_id, grupo_id, profesorId,
            parcial_1, parcial_2, parcial_3,
            calificacion_ordinario, calificacion_extraordinario, calificacion_final,
            estatus, observaciones, ciclo_escolar
        ]);

        res.status(201).json({ 
            message: 'Calificación creada exitosamente',
            id: result.insertId
        });
    } catch (error) {
        console.error('Error al crear calificación:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

export default router;