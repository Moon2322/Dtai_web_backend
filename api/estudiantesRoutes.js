import express from 'express';
import { db } from '../index.js';
import { verifyToken } from '../middleware/auth.js';

const router = express.Router();
router.get('/estudiante/perfil', verifyToken, async (req, res) => {
    try {
        const usuarioId = req.userId;
        
        const [rows] = await db.execute(`
            SELECT 
                a.id,
                a.matricula,
                a.cuatrimestre_actual,
                a.fecha_ingreso,
                a.telefono,
                a.direccion,
                a.fecha_nacimiento,
                a.estado_alumno,
                a.promedio_general,
                a.creditos_acumulados,
                u.nombre,
                u.apellido,
                u.correo,
                u.avatar_url,
                c.nombre AS carrera,
                c.codigo AS codigo_carrera,
                c.duracion_cuatrimestres
            FROM alumnos a
            INNER JOIN usuarios u ON a.usuario_id = u.id
            INNER JOIN carreras c ON a.carrera_id = c.id
            WHERE a.usuario_id = ?
        `, [usuarioId]);

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Estudiante no encontrado' });
        }

        res.json(rows[0]);
    } catch (error) {
        console.error('Error al obtener perfil del estudiante:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});
router.get('/estudiante/calificaciones', verifyToken, async (req, res) => {
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
                a.creditos,
                a.cuatrimestre,
                CONCAT(u.nombre, ' ', u.apellido) AS profesor
            FROM calificaciones c
            INNER JOIN asignaturas a ON c.asignatura_id = a.id
            INNER JOIN profesores p ON c.profesor_id = p.id
            INNER JOIN usuarios u ON p.usuario_id = u.id
            WHERE c.alumno_id = ?
            ORDER BY a.cuatrimestre, a.nombre
        `, [alumnoId]);

        res.json(rows);
    } catch (error) {
        console.error('Error al obtener calificaciones:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});
router.get('/estudiante/reportes', verifyToken, async (req, res) => {
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
                r.id,
                r.tipo_riesgo,
                r.nivel_riesgo,
                r.descripcion,
                r.observaciones,
                r.acciones_recomendadas,
                r.fecha_reporte,
                r.fecha_seguimiento,
                r.estado,
                r.resolucion,
                CONCAT(u.nombre, ' ', u.apellido) AS profesor
            FROM reportes_riesgo r
            INNER JOIN profesores p ON r.profesor_id = p.id
            INNER JOIN usuarios u ON p.usuario_id = u.id
            WHERE r.alumno_id = ? AND r.estado != 'cerrado'
            ORDER BY r.fecha_reporte DESC
        `, [alumnoId]);

        res.json(rows);
    } catch (error) {
        console.error('Error al obtener reportes:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});
router.get('/estudiante/horarios', verifyToken, async (req, res) => {
    try {
        const usuarioId = req.userId;
        
        const [alumnoRows] = await db.execute(`
            SELECT a.id as alumno_id, ag.grupo_id 
            FROM alumnos a
            INNER JOIN alumnos_grupos ag ON a.id = ag.alumno_id
            WHERE a.usuario_id = ? AND ag.activo = 1
        `, [usuarioId]);

        if (alumnoRows.length === 0) {
            return res.status(404).json({ error: 'Estudiante no encontrado o sin grupo asignado' });
        }

        const grupoId = alumnoRows[0].grupo_id;

        const [rows] = await db.execute(`
            SELECT 
                h.id,
                h.dia_semana,
                h.hora_inicio,
                h.hora_fin,
                h.aula,
                h.tipo_clase,
                a.nombre AS asignatura,
                a.codigo AS codigo_asignatura,
                CONCAT(u.nombre, ' ', u.apellido) AS profesor
            FROM horarios h
            INNER JOIN profesor_asignatura_grupo pag ON h.profesor_asignatura_grupo_id = pag.id
            INNER JOIN asignaturas a ON pag.asignatura_id = a.id
            INNER JOIN profesores p ON pag.profesor_id = p.id
            INNER JOIN usuarios u ON p.usuario_id = u.id
            WHERE pag.grupo_id = ? AND h.activo = 1 AND pag.activo = 1
            ORDER BY 
                FIELD(h.dia_semana, 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'),
                h.hora_inicio
        `, [grupoId]);

        res.json(rows);
    } catch (error) {
        console.error('Error al obtener horarios:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});
router.get('/estudiante/solicitudes-ayuda', verifyToken, async (req, res) => {
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
                s.id,
                s.tipo_problema,
                s.descripcion_problema,
                s.urgencia,
                s.contacto_preferido,
                s.estado,
                s.respuesta,
                s.fecha_solicitud,
                s.fecha_respuesta,
                CASE 
                    WHEN s.asignado_a IS NOT NULL THEN CONCAT(u.nombre, ' ', u.apellido)
                    ELSE NULL
                END AS asignado_a_nombre
            FROM solicitudes_ayuda s
            LEFT JOIN directivos d ON s.asignado_a = d.id
            LEFT JOIN usuarios u ON d.usuario_id = u.id
            WHERE s.alumno_id = ?
            ORDER BY s.fecha_solicitud DESC
        `, [alumnoId]);

        res.json(rows);
    } catch (error) {
        console.error('Error al obtener solicitudes de ayuda:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});
router.post('/estudiante/solicitud-ayuda', verifyToken, async (req, res) => {
    try {
        const usuarioId = req.userId;
        const { tipo_problema, descripcion_problema, urgencia, contacto_preferido } = req.body;
        if (!tipo_problema || !descripcion_problema) {
            return res.status(400).json({ error: 'Tipo de problema y descripción son requeridos' });
        }
        const [alumnoRows] = await db.execute(`
            SELECT id FROM alumnos WHERE usuario_id = ?
        `, [usuarioId]);

        if (alumnoRows.length === 0) {
            return res.status(404).json({ error: 'Estudiante no encontrado' });
        }

        const alumnoId = alumnoRows[0].id;

        const [result] = await db.execute(`
            INSERT INTO solicitudes_ayuda (
                alumno_id, 
                tipo_problema, 
                descripcion_problema, 
                urgencia, 
                contacto_preferido
            ) VALUES (?, ?, ?, ?, ?)
        `, [alumnoId, tipo_problema, descripcion_problema, urgencia || 'media', contacto_preferido || 'correo']);

        res.status(201).json({ 
            message: 'Solicitud de ayuda creada exitosamente',
            id: result.insertId
        });
    } catch (error) {
        console.error('Error al crear solicitud de ayuda:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});
router.put('/estudiante/perfil', verifyToken, async (req, res) => {
    try {
        const usuarioId = req.userId;
        const { telefono, direccion } = req.body;
        await db.execute(`
            UPDATE alumnos 
            SET telefono = ?, direccion = ?
            WHERE usuario_id = ?
        `, [telefono, direccion, usuarioId]);

        res.json({ message: 'Perfil actualizado exitosamente' });
    } catch (error) {
        console.error('Error al actualizar perfil:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

export default router;