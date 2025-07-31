import express from 'express';
import { db } from '../index.js';
import { verifyToken } from '../middleware/auth.js';

const router = express.Router();

// Middleware para verificar que el usuario sea profesor
const verifyProfesor = async (req, res, next) => {
    try {
        const [profesor] = await db.execute(
            'SELECT id FROM profesores WHERE usuario_id = (SELECT id FROM usuarios WHERE correo = ?)',
            [req.user.correo]
        );
        
        if (profesor.length === 0) {
            return res.status(403).json({
                success: false,
                message: 'Acceso denegado. No eres un profesor registrado.'
            });
        }
        
        req.profesor_id = profesor[0].id;
        next();
    } catch (error) {
        console.error('Error en verifyProfesor:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
};

// Usar middleware en todas las rutas
router.use(verifyToken);
router.use(verifyProfesor);

// Obtener perfil del profesor
router.get('/perfil', async (req, res) => {
    try {
        const [profesor] = await db.execute(`
            SELECT 
                p.*,
                u.nombre,
                u.apellido,
                u.correo,
                c.nombre as carrera_nombre
            FROM profesores p
            JOIN usuarios u ON p.usuario_id = u.id
            LEFT JOIN carreras c ON p.carrera_id = c.id
            WHERE p.id = ?
        `, [req.profesor_id]);

        if (profesor.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Profesor no encontrado'
            });
        }

        res.json({
            success: true,
            data: profesor[0]
        });

    } catch (error) {
        console.error('Error al obtener perfil del profesor:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

// Obtener estadísticas del profesor usando tu estructura real
router.get('/estadisticas', async (req, res) => {
    try {
        // Asignaturas activas que imparte el profesor
        const [asignaturas] = await db.execute(`
            SELECT COUNT(*) as total
            FROM profesor_asignatura_grupo pag
            WHERE pag.profesor_id = ? AND pag.activo = 1
        `, [req.profesor_id]);

        // Total de estudiantes en todas sus materias
        const [estudiantes] = await db.execute(`
            SELECT COUNT(DISTINCT ag.alumno_id) as total
            FROM alumnos_grupos ag
            JOIN profesor_asignatura_grupo pag ON ag.grupo_id = pag.grupo_id
            WHERE pag.profesor_id = ? AND pag.activo = 1 AND ag.activo = 1
        `, [req.profesor_id]);

        // Calificaciones pendientes (usando tu tabla de calificaciones)
        const [pendientes] = await db.execute(`
            SELECT COUNT(*) as total
            FROM calificaciones c
            JOIN profesor_asignatura_grupo pag ON c.asignatura_id = pag.asignatura_id 
            WHERE pag.profesor_id = ? 
            AND c.calificacion IS NULL 
            AND pag.activo = 1
        `, [req.profesor_id]);

        // Solicitudes de ayuda pendientes de estudiantes de sus grupos
        const [solicitudes] = await db.execute(`
            SELECT COUNT(*) as total
            FROM solicitudes_ayuda sa
            JOIN alumnos a ON sa.alumno_id = a.id
            JOIN alumnos_grupos ag ON a.id = ag.alumno_id
            JOIN profesor_asignatura_grupo pag ON ag.grupo_id = pag.grupo_id
            WHERE pag.profesor_id = ? 
            AND sa.estado IN ('pendiente', 'en_proceso')
            AND pag.activo = 1
        `, [req.profesor_id]);

        res.json({
            success: true,
            data: {
                asignaturas_activas: asignaturas[0].total,
                total_estudiantes: estudiantes[0].total,
                calificaciones_pendientes: pendientes[0].total,
                solicitudes_ayuda: solicitudes[0].total
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



// Obtener estudiantes recientes del profesor
router.get('/estudiantes-recientes', async (req, res) => {
    try {
        const [estudiantes] = await db.execute(`
            SELECT DISTINCT
                u.nombre,
                u.apellido,
                al.matricula,
                a.nombre as asignatura_nombre,
                g.codigo as grupo_codigo,
                ag.fecha_inscripcion
            FROM alumnos_grupos ag
            JOIN alumnos al ON ag.alumno_id = al.id
            JOIN usuarios u ON al.usuario_id = u.id
            JOIN grupos g ON ag.grupo_id = g.id
            JOIN profesor_asignatura_grupo pag ON g.id = pag.grupo_id
            JOIN asignaturas a ON pag.asignatura_id = a.id
            WHERE pag.profesor_id = ? 
            AND pag.activo = 1 
            AND ag.activo = 1
            ORDER BY ag.fecha_inscripcion DESC
            LIMIT 10
        `, [req.profesor_id]);

        res.json({
            success: true,
            data: estudiantes
        });

    } catch (error) {
        console.error('Error al obtener estudiantes recientes:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

// Obtener calificaciones pendientes usando tu estructura
router.get('/calificaciones-pendientes', async (req, res) => {
    try {
        const [pendientes] = await db.execute(`
            SELECT 
                u.nombre as estudiante_nombre,
                u.apellido as estudiante_apellido,
                al.matricula,
                a.nombre as asignatura_nombre,
                g.codigo as grupo_codigo,
                c.fecha_evaluacion
            FROM calificaciones c
            JOIN alumnos al ON c.alumno_id = al.id
            JOIN usuarios u ON al.usuario_id = u.id
            JOIN asignaturas a ON c.asignatura_id = a.id
            JOIN profesor_asignatura_grupo pag ON a.id = pag.asignatura_id
            JOIN grupos g ON pag.grupo_id = g.id
            WHERE pag.profesor_id = ? 
            AND c.calificacion IS NULL 
            AND pag.activo = 1
            ORDER BY c.fecha_evaluacion DESC
            LIMIT 10
        `, [req.profesor_id]);

        res.json({
            success: true,
            data: pendientes
        });

    } catch (error) {
        console.error('Error al obtener calificaciones pendientes:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

// Registrar nueva asignatura usando tu estructura
router.post('/asignaturas', async (req, res) => {
    try {
        const {
            asignatura_nombre,
            asignatura_codigo,
            grupo_codigo,
            cuatrimestre,
            ciclo_escolar
        } = req.body;

        // Validaciones
        if (!asignatura_nombre || !asignatura_codigo || !grupo_codigo || !cuatrimestre || !ciclo_escolar) {
            return res.status(400).json({
                success: false,
                message: 'Todos los campos son obligatorios'
            });
        }

        // Verificar si ya existe la asignatura
        let asignatura_id = null;
        const [asignaturaExistente] = await db.execute(
            'SELECT id FROM asignaturas WHERE codigo = ?',
            [asignatura_codigo]
        );

        if (asignaturaExistente.length > 0) {
            asignatura_id = asignaturaExistente[0].id;
        } else {
            // Crear nueva asignatura
            const [nuevaAsignatura] = await db.execute(`
                INSERT INTO asignaturas (codigo, nombre, cuatrimestre, carrera_id, activa)
                VALUES (?, ?, ?, (SELECT carrera_id FROM profesores WHERE id = ?), 1)
            `, [asignatura_codigo, asignatura_nombre, cuatrimestre, req.profesor_id]);
            
            asignatura_id = nuevaAsignatura.insertId;
        }

        // Verificar si existe el grupo
        let grupo_id = null;
        const [grupoExistente] = await db.execute(
            'SELECT id FROM grupos WHERE codigo = ?',
            [grupo_codigo]
        );

        if (grupoExistente.length > 0) {
            grupo_id = grupoExistente[0].id;
        } else {
            // Crear nuevo grupo
            const [nuevoGrupo] = await db.execute(`
                INSERT INTO grupos (codigo, carrera_id, cuatrimestre, ciclo_escolar, periodo, año, activo)
                VALUES (?, (SELECT carrera_id FROM profesores WHERE id = ?), ?, ?, 'ENE-ABR', YEAR(NOW()), 1)
            `, [grupo_codigo, req.profesor_id, cuatrimestre, ciclo_escolar]);
            
            grupo_id = nuevoGrupo.insertId;
        }

        // Crear asignación profesor-asignatura-grupo
        const [asignacion] = await db.execute(`
            INSERT INTO profesor_asignatura_grupo (
                profesor_id, asignatura_id, grupo_id, ciclo_escolar, activo
            ) VALUES (?, ?, ?, ?, 1)
        `, [req.profesor_id, asignatura_id, grupo_id, ciclo_escolar]);

        res.json({
            success: true,
            message: 'Asignatura registrada exitosamente',
            data: { id: asignacion.insertId }
        });

    } catch (error) {
        console.error('Error al registrar asignatura:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

// Eliminar asignatura del profesor
router.delete('/asignaturas/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // Verificar que la asignación pertenece al profesor
        const [asignacion] = await db.execute(`
            SELECT id FROM profesor_asignatura_grupo 
            WHERE id = ? AND profesor_id = ?
        `, [id, req.profesor_id]);

        if (asignacion.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Asignación no encontrada'
            });
        }

        // Marcar como inactiva en lugar de eliminar
        await db.execute(`
            UPDATE profesor_asignatura_grupo 
            SET activo = 0 
            WHERE id = ? AND profesor_id = ?
        `, [id, req.profesor_id]);

        res.json({
            success: true,
            message: 'Asignatura eliminada exitosamente'
        });

    } catch (error) {
        console.error('Error al eliminar asignatura:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

// Obtener solicitudes de ayuda de los estudiantes del profesor
// Obtener solicitudes de ayuda de los estudiantes del profesor
router.get('/solicitudes-ayuda', async (req, res) => {
    try {
const [solicitudes] = await db.execute(`
    SELECT 
        sa.id,
        sa.tipo_problema as categoria,
        sa.descripcion_problema as asunto,
        sa.urgencia,
        sa.estado,
        sa.contacto_preferido,
sa.fecha_solicitud as fecha_creacion,
        al.matricula,
        u.nombre as alumno_nombre,
        u.apellido as alumno_apellido,
        u.correo as email,
        CONCAT(u.nombre, ' ', u.apellido) as contacto,
        CASE 
            WHEN al.telefono IS NOT NULL THEN al.telefono
            ELSE 'Sin teléfono'
        END as telefono
    FROM solicitudes_ayuda sa
    JOIN alumnos al ON sa.alumno_id = al.id
    JOIN usuarios u ON al.usuario_id = u.id
    WHERE al.tutor_nombre = (
        SELECT CONCAT(up.nombre, ' ', up.apellido)
        FROM profesores p
        JOIN usuarios up ON p.usuario_id = up.id
        WHERE p.id = ?
    )
    ORDER BY sa.fecha_solicitud DESC
`, [req.profesor_id]);

        res.json({
            success: true,
            data: solicitudes
        });

    } catch (error) {
        console.error('Error al obtener solicitudes de ayuda:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

// Cambiar estado de solicitud de ayuda
// Cambiar estado de solicitud de ayuda
router.put('/solicitudes-ayuda/:id/estado', async (req, res) => {
    try {
        const { id } = req.params;
        const { estado } = req.body;

        // Simplificar la verificación - buscar por tutor_nombre
        const [solicitud] = await db.execute(`
            SELECT sa.id 
            FROM solicitudes_ayuda sa
            JOIN alumnos al ON sa.alumno_id = al.id
            WHERE sa.id = ? AND al.tutor_nombre = (
                SELECT CONCAT(up.nombre, ' ', up.apellido)
                FROM profesores p
                JOIN usuarios up ON p.usuario_id = up.id
                WHERE p.id = ?
            )
        `, [id, req.profesor_id]);

        if (solicitud.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Solicitud no encontrada'
            });
        }

        await db.execute(
            'UPDATE solicitudes_ayuda SET estado = ? WHERE id = ?',
            [estado, id]
        );

        res.json({
            success: true,
            message: 'Estado actualizado correctamente'
        });

    } catch (error) {
        console.error('Error al actualizar estado:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

// Obtener mensajes del chat de una solicitud de ayuda
router.get('/solicitudes-ayuda/:id/chat', async (req, res) => {
    try {
        const { id } = req.params;

        // Verificar que la solicitud pertenece a un estudiante del profesor
        const [solicitud] = await db.execute(`
            SELECT sa.id 
            FROM solicitudes_ayuda sa
            JOIN alumnos al ON sa.alumno_id = al.id
            WHERE sa.id = ? AND al.tutor_nombre = (
                SELECT CONCAT(up.nombre, ' ', up.apellido)
                FROM profesores p
                JOIN usuarios up ON p.usuario_id = up.id
                WHERE p.id = ?
            )
        `, [id, req.profesor_id]);

        if (solicitud.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Solicitud no encontrada'
            });
        }

        // Obtener mensajes del chat
        const [mensajes] = await db.execute(`
            SELECT 
                c.id,
                c.mensaje,
                c.tipo_usuario,
                c.fecha_mensaje,
                CASE 
                    WHEN c.tipo_usuario = 'alumno' THEN CONCAT(ua.nombre, ' ', ua.apellido)
                    WHEN c.tipo_usuario = 'profesor' THEN CONCAT(up.nombre, ' ', up.apellido)
                    WHEN c.tipo_usuario = 'directivo' THEN CONCAT(ud.nombre, ' ', ud.apellido)
                    ELSE 'Sistema'
                END as nombre_usuario
            FROM chat_ayuda c
            LEFT JOIN usuarios ua ON c.usuario_id = ua.id AND c.tipo_usuario = 'alumno'
            LEFT JOIN usuarios up ON c.usuario_id = up.id AND c.tipo_usuario = 'profesor'
            LEFT JOIN usuarios ud ON c.usuario_id = ud.id AND c.tipo_usuario = 'directivo'
            WHERE c.solicitud_id = ?
            ORDER BY c.fecha_mensaje ASC
        `, [id]);

        res.json({
            success: true,
            data: mensajes
        });

    } catch (error) {
        console.error('Error al obtener mensajes del chat:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

// Enviar mensaje en el chat de una solicitud de ayuda
router.post('/solicitudes-ayuda/:id/chat', async (req, res) => {
    try {
        const { id } = req.params;
        const { mensaje } = req.body;

        if (!mensaje || !mensaje.trim()) {
            return res.status(400).json({
                success: false,
                message: 'El mensaje es requerido'
            });
        }

        // Verificar que la solicitud pertenece a un estudiante del profesor
        const [solicitud] = await db.execute(`
            SELECT sa.id 
            FROM solicitudes_ayuda sa
            JOIN alumnos al ON sa.alumno_id = al.id
            WHERE sa.id = ? AND al.tutor_nombre = (
                SELECT CONCAT(up.nombre, ' ', up.apellido)
                FROM profesores p
                JOIN usuarios up ON p.usuario_id = up.id
                WHERE p.id = ?
            )
        `, [id, req.profesor_id]);

        if (solicitud.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Solicitud no encontrada'
            });
        }

        // Obtener el usuario_id del profesor
        const [profesor] = await db.execute(
            'SELECT usuario_id FROM profesores WHERE id = ?',
            [req.profesor_id]
        );

        // Insertar mensaje en el chat
        const [resultado] = await db.execute(`
            INSERT INTO chat_ayuda (solicitud_id, usuario_id, mensaje, tipo_usuario)
            VALUES (?, ?, ?, 'profesor')
        `, [id, profesor[0].usuario_id, mensaje.trim()]);

        res.status(201).json({
            success: true,
            message: 'Mensaje enviado exitosamente',
            data: { id: resultado.insertId }
        });

    } catch (error) {
        console.error('Error al enviar mensaje:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

// Obtener grupos disponibles
router.get('/grupos', async (req, res) => {
    try {
        const [grupos] = await db.execute(`
            SELECT 
                g.id,
                g.codigo,
                g.cuatrimestre,
                g.periodo,
                g.año,
                c.nombre as carrera_nombre,
                c.codigo as carrera_codigo
            FROM grupos g
            JOIN carreras c ON g.carrera_id = c.id
            WHERE g.activo = 1
            ORDER BY g.codigo ASC
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

// En api/profesorRoutes.js - Agregar estas rutas antes del export default router

// Obtener calificaciones del profesor
router.get('/calificaciones', async (req, res) => {
    try {
        const [calificaciones] = await db.execute(`
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
                c.fecha_actualizacion,
                CONCAT(u.nombre, ' ', u.apellido) as estudiante,
                al.matricula,
                a.nombre as asignatura,
                a.codigo as asignatura_codigo,
                g.codigo as grupo,
                g.cuatrimestre
            FROM calificaciones c
            JOIN alumnos al ON c.alumno_id = al.id
            JOIN usuarios u ON al.usuario_id = u.id
            JOIN asignaturas a ON c.asignatura_id = a.id
            JOIN grupos g ON c.grupo_id = g.id
            WHERE c.profesor_id = ?
            ORDER BY c.fecha_actualizacion DESC
        `, [req.profesor_id]);

        res.json({
            success: true,
            data: calificaciones
        });

    } catch (error) {
        console.error('Error al obtener calificaciones:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

// Obtener estudiantes de un grupo para asignar calificaciones
router.get('/calificaciones/estudiantes/:grupoId/:asignaturaId', async (req, res) => {
    try {
        const { grupoId, asignaturaId } = req.params;

        // Verificar que el profesor tenga acceso a esta asignatura-grupo
        const [acceso] = await db.execute(`
            SELECT id FROM profesor_asignatura_grupo 
            WHERE profesor_id = ? AND asignatura_id = ? AND grupo_id = ? AND activo = 1
        `, [req.profesor_id, asignaturaId, grupoId]);

        if (acceso.length === 0) {
            return res.status(403).json({
                success: false,
                message: 'No tienes acceso a esta asignatura/grupo'
            });
        }

        const [estudiantes] = await db.execute(`
            SELECT 
                al.id as alumno_id,
                CONCAT(u.nombre, ' ', u.apellido) as estudiante,
                al.matricula,
                c.id as calificacion_id,
                c.parcial_1,
                c.parcial_2,
                c.parcial_3,
                c.calificacion_ordinario,
                c.calificacion_extraordinario,
                c.calificacion_final,
                c.estatus,
                c.observaciones
            FROM alumnos_grupos ag
            JOIN alumnos al ON ag.alumno_id = al.id
            JOIN usuarios u ON al.usuario_id = u.id
            LEFT JOIN calificaciones c ON (
                c.alumno_id = al.id 
                AND c.asignatura_id = ? 
                AND c.grupo_id = ? 
                AND c.profesor_id = ?
            )
            WHERE ag.grupo_id = ? AND ag.activo = 1
            ORDER BY u.apellido, u.nombre
        `, [asignaturaId, grupoId, req.profesor_id, grupoId]);

        res.json({
            success: true,
            data: estudiantes
        });

    } catch (error) {
        console.error('Error al obtener estudiantes:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

// Crear o actualizar calificación
router.post('/calificaciones', async (req, res) => {
    try {
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

        // Validaciones básicas
        if (!alumno_id || !asignatura_id || !grupo_id || !ciclo_escolar) {
            return res.status(400).json({
                success: false,
                message: 'Datos incompletos'
            });
        }

        // Verificar que el profesor tenga acceso
        const [acceso] = await db.execute(`
            SELECT id FROM profesor_asignatura_grupo 
            WHERE profesor_id = ? AND asignatura_id = ? AND grupo_id = ? AND activo = 1
        `, [req.profesor_id, asignatura_id, grupo_id]);

        if (acceso.length === 0) {
            return res.status(403).json({
                success: false,
                message: 'No tienes acceso a esta asignatura/grupo'
            });
        }

        // Verificar si ya existe una calificación
        const [existente] = await db.execute(`
            SELECT id FROM calificaciones 
            WHERE alumno_id = ? AND asignatura_id = ? AND grupo_id = ? AND ciclo_escolar = ?
        `, [alumno_id, asignatura_id, grupo_id, ciclo_escolar]);

        let resultado;
        
        if (existente.length > 0) {
            // Actualizar calificación existente
            await db.execute(`
                UPDATE calificaciones SET
                    parcial_1 = ?,
                    parcial_2 = ?,
                    parcial_3 = ?,
                    calificacion_ordinario = ?,
                    calificacion_extraordinario = ?,
                    calificacion_final = ?,
                    estatus = ?,
                    observaciones = ?,
                    fecha_actualizacion = NOW()
                WHERE id = ?
            `, [
                parcial_1, parcial_2, parcial_3,
                calificacion_ordinario, calificacion_extraordinario, calificacion_final,
                estatus || 'cursando', observaciones,
                existente[0].id
            ]);

            resultado = { id: existente[0].id };
        } else {
            // Crear nueva calificación
            const [nueva] = await db.execute(`
                INSERT INTO calificaciones (
                    alumno_id, asignatura_id, grupo_id, profesor_id,
                    parcial_1, parcial_2, parcial_3,
                    calificacion_ordinario, calificacion_extraordinario, calificacion_final,
                    estatus, observaciones, ciclo_escolar
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                alumno_id, asignatura_id, grupo_id, req.profesor_id,
                parcial_1, parcial_2, parcial_3,
                calificacion_ordinario, calificacion_extraordinario, calificacion_final,
                estatus || 'cursando', observaciones, ciclo_escolar
            ]);

            resultado = { id: nueva.insertId };
        }

        res.json({
            success: true,
            message: 'Calificación guardada exitosamente',
            data: resultado
        });

    } catch (error) {
        console.error('Error al guardar calificación:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

// Actualizar calificación específica
router.put('/calificaciones/:id', async (req, res) => {
    try {
        const { id } = req.params;
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

        // Verificar que la calificación pertenece al profesor
        const [calificacion] = await db.execute(
            'SELECT id FROM calificaciones WHERE id = ? AND profesor_id = ?',
            [id, req.profesor_id]
        );

        if (calificacion.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Calificación no encontrada'
            });
        }

        await db.execute(`
            UPDATE calificaciones SET
                parcial_1 = ?,
                parcial_2 = ?,
                parcial_3 = ?,
                calificacion_ordinario = ?,
                calificacion_extraordinario = ?,
                calificacion_final = ?,
                estatus = ?,
                observaciones = ?,
                fecha_actualizacion = NOW()
            WHERE id = ?
        `, [
            parcial_1, parcial_2, parcial_3,
            calificacion_ordinario, calificacion_extraordinario, calificacion_final,
            estatus, observaciones, id
        ]);

        res.json({
            success: true,
            message: 'Calificación actualizada exitosamente'
        });

    } catch (error) {
        console.error('Error al actualizar calificación:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

// Eliminar calificación
router.delete('/calificaciones/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // Verificar que la calificación pertenece al profesor
        const [calificacion] = await db.execute(
            'SELECT id FROM calificaciones WHERE id = ? AND profesor_id = ?',
            [id, req.profesor_id]
        );

        if (calificacion.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Calificación no encontrada'
            });
        }

        await db.execute('DELETE FROM calificaciones WHERE id = ?', [id]);

        res.json({
            success: true,
            message: 'Calificación eliminada exitosamente'
        });

    } catch (error) {
        console.error('Error al eliminar calificación:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

// Obtener estadísticas de calificaciones del profesor
router.get('/calificaciones/estadisticas', async (req, res) => {
    try {
        const [estadisticas] = await db.execute(`
            SELECT 
                COUNT(*) as total_calificaciones,
                AVG(COALESCE(calificacion_final, calificacion_ordinario, parcial_1)) as promedio_general,
                SUM(CASE WHEN estatus = 'aprobado' THEN 1 ELSE 0 END) as aprobados,
                SUM(CASE WHEN estatus = 'reprobado' THEN 1 ELSE 0 END) as reprobados
            FROM calificaciones
            WHERE profesor_id = ?
        `, [req.profesor_id]);

        res.json({
            success: true,
            data: estadisticas[0]
        });

    } catch (error) {
        console.error('Error al obtener estadísticas:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});


// En api/profesorRoutes.js - Reemplazar las rutas existentes de asignaturas

// Obtener todas las asignaturas disponibles para asignar
router.get('/asignaturas-disponibles', async (req, res) => {
    try {
        const [asignaturas] = await db.execute(`
            SELECT 
                id,
                nombre,
                codigo,
                cuatrimestre,
                horas_teoricas,
                horas_practicas
            FROM asignaturas 
            WHERE activa = 1
            ORDER BY cuatrimestre, nombre
        `);

        res.json({
            success: true,
            data: asignaturas
        });

    } catch (error) {
        console.error('Error al obtener asignaturas disponibles:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

// Obtener asignaciones del profesor (asignaturas que ya tiene asignadas)
router.get('/mis-asignaturas', async (req, res) => {
    try {
        const [asignaciones] = await db.execute(`
            SELECT 
                pag.id,
                pag.ciclo_escolar,
                pag.fecha_asignacion,
                a.id as asignatura_id,
                a.nombre as asignatura_nombre,
                a.codigo as asignatura_codigo,
                a.cuatrimestre,
                g.id as grupo_id,
                g.codigo as grupo_codigo,
                g.periodo,
                g.año,
                c.nombre as carrera_nombre,
                c.codigo as carrera_codigo,
                COUNT(ag.alumno_id) as total_estudiantes
            FROM profesor_asignatura_grupo pag
            JOIN asignaturas a ON pag.asignatura_id = a.id
            JOIN grupos g ON pag.grupo_id = g.id
            JOIN carreras c ON g.carrera_id = c.id
            LEFT JOIN alumnos_grupos ag ON g.id = ag.grupo_id AND ag.activo = 1
            WHERE pag.profesor_id = ? AND pag.activo = 1
            GROUP BY pag.id
            ORDER BY pag.fecha_asignacion DESC
        `, [req.profesor_id]);

        res.json({
            success: true,
            data: asignaciones
        });

    } catch (error) {
        console.error('Error al obtener asignaciones del profesor:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

// Crear nueva asignación profesor-asignatura-grupo
router.post('/asignar-materia', async (req, res) => {
    try {
        const {
            asignatura_id,
            grupo_id,
            ciclo_escolar,
            horarios = []
        } = req.body;

        // Validaciones
        if (!asignatura_id || !grupo_id || !ciclo_escolar) {
            return res.status(400).json({
                success: false,
                message: 'Asignatura, grupo y ciclo escolar son requeridos'
            });
        }

        // Verificar que la asignatura existe
        const [asignatura] = await db.execute(
            'SELECT id, nombre FROM asignaturas WHERE id = ? AND activa = 1',
            [asignatura_id]
        );

        if (asignatura.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Asignatura no encontrada'
            });
        }

        // Verificar que el grupo existe
        const [grupo] = await db.execute(
            'SELECT id, codigo FROM grupos WHERE id = ? AND activo = 1',
            [grupo_id]
        );

        if (grupo.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Grupo no encontrado'
            });
        }

        // Verificar que no exista ya esta asignación
        const [existente] = await db.execute(`
            SELECT id FROM profesor_asignatura_grupo 
            WHERE profesor_id = ? AND asignatura_id = ? AND grupo_id = ? AND ciclo_escolar = ? AND activo = 1
        `, [req.profesor_id, asignatura_id, grupo_id, ciclo_escolar]);

        if (existente.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Ya tienes asignada esta materia a este grupo en este ciclo escolar'
            });
        }

        // Crear la asignación
        const [resultado] = await db.execute(`
            INSERT INTO profesor_asignatura_grupo (
                profesor_id, asignatura_id, grupo_id, ciclo_escolar, activo
            ) VALUES (?, ?, ?, ?, 1)
        `, [req.profesor_id, asignatura_id, grupo_id, ciclo_escolar]);

        const asignacion_id = resultado.insertId;

        // Si se proporcionaron horarios, crearlos
        if (horarios.length > 0) {
            for (const horario of horarios) {
                const { dia_semana, hora_inicio, hora_fin, aula, tipo_clase } = horario;
                
                if (dia_semana && hora_inicio && hora_fin) {
                    await db.execute(`
                        INSERT INTO horarios (
                            profesor_asignatura_grupo_id, dia_semana, hora_inicio, hora_fin, aula, tipo_clase, activo
                        ) VALUES (?, ?, ?, ?, ?, ?, 1)
                    `, [asignacion_id, dia_semana, hora_inicio, hora_fin, aula || null, tipo_clase || 'teorica']);
                }
            }
        }

        res.status(201).json({
            success: true,
            message: `Asignatura "${asignatura[0].nombre}" asignada al grupo "${grupo[0].codigo}" exitosamente`,
            data: { id: asignacion_id }
        });

    } catch (error) {
        console.error('Error al crear asignación:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

// Obtener horarios de una asignación específica
router.get('/asignacion/:id/horarios', async (req, res) => {
    try {
        const { id } = req.params;

        // Verificar que la asignación pertenece al profesor
        const [asignacion] = await db.execute(
            'SELECT id FROM profesor_asignatura_grupo WHERE id = ? AND profesor_id = ? AND activo = 1',
            [id, req.profesor_id]
        );

        if (asignacion.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Asignación no encontrada'
            });
        }

        const [horarios] = await db.execute(`
            SELECT 
                id,
                dia_semana,
                hora_inicio,
                hora_fin,
                aula,
                tipo_clase
            FROM horarios 
            WHERE profesor_asignatura_grupo_id = ? AND activo = 1
            ORDER BY 
                FIELD(dia_semana, 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'),
                hora_inicio
        `, [id]);

        res.json({
            success: true,
            data: horarios
        });

    } catch (error) {
        console.error('Error al obtener horarios:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

// Agregar horario a una asignación
router.post('/asignacion/:id/horarios', async (req, res) => {
    try {
        const { id } = req.params;
        const { dia_semana, hora_inicio, hora_fin, aula, tipo_clase } = req.body;

        // Validaciones
        if (!dia_semana || !hora_inicio || !hora_fin) {
            return res.status(400).json({
                success: false,
                message: 'Día, hora de inicio y hora de fin son requeridos'
            });
        }

        // Verificar que la asignación pertenece al profesor
        const [asignacion] = await db.execute(
            'SELECT id FROM profesor_asignatura_grupo WHERE id = ? AND profesor_id = ? AND activo = 1',
            [id, req.profesor_id]
        );

        if (asignacion.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Asignación no encontrada'
            });
        }

        // Verificar conflicto de horarios
        const [conflicto] = await db.execute(`
            SELECT h.id 
            FROM horarios h
            JOIN profesor_asignatura_grupo pag ON h.profesor_asignatura_grupo_id = pag.id
            WHERE pag.profesor_id = ? 
            AND h.dia_semana = ? 
            AND h.activo = 1
            AND (
                (? BETWEEN h.hora_inicio AND h.hora_fin) OR
                (? BETWEEN h.hora_inicio AND h.hora_fin) OR
                (h.hora_inicio BETWEEN ? AND ?) OR
                (h.hora_fin BETWEEN ? AND ?)
            )
        `, [req.profesor_id, dia_semana, hora_inicio, hora_fin, hora_inicio, hora_fin, hora_inicio, hora_fin]);

        if (conflicto.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Ya tienes una clase programada en ese horario'
            });
        }

        // Crear el horario
        const [resultado] = await db.execute(`
            INSERT INTO horarios (
                profesor_asignatura_grupo_id, dia_semana, hora_inicio, hora_fin, aula, tipo_clase, activo
            ) VALUES (?, ?, ?, ?, ?, ?, 1)
        `, [id, dia_semana, hora_inicio, hora_fin, aula || null, tipo_clase || 'teorica']);

        res.status(201).json({
            success: true,
            message: 'Horario agregado exitosamente',
            data: { id: resultado.insertId }
        });

    } catch (error) {
        console.error('Error al agregar horario:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

// Eliminar horario
router.delete('/horarios/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // Verificar que el horario pertenece al profesor
        const [horario] = await db.execute(`
            SELECT h.id 
            FROM horarios h
            JOIN profesor_asignatura_grupo pag ON h.profesor_asignatura_grupo_id = pag.id
            WHERE h.id = ? AND pag.profesor_id = ?
        `, [id, req.profesor_id]);

        if (horario.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Horario no encontrado'
            });
        }

        // Marcar como inactivo
        await db.execute('UPDATE horarios SET activo = 0 WHERE id = ?', [id]);

        res.json({
            success: true,
            message: 'Horario eliminado exitosamente'
        });

    } catch (error) {
        console.error('Error al eliminar horario:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

// Eliminar asignación (desasignar materia)
router.delete('/asignacion/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // Verificar que la asignación pertenece al profesor
        const [asignacion] = await db.execute(
            'SELECT id FROM profesor_asignatura_grupo WHERE id = ? AND profesor_id = ? AND activo = 1',
            [id, req.profesor_id]
        );

        if (asignacion.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Asignación no encontrada'
            });
        }

        // Verificar si hay calificaciones registradas
        const [calificaciones] = await db.execute(`
            SELECT COUNT(*) as total 
            FROM calificaciones c
            JOIN profesor_asignatura_grupo pag ON c.asignatura_id = pag.asignatura_id AND c.grupo_id = pag.grupo_id
            WHERE pag.id = ? AND c.profesor_id = ?
        `, [id, req.profesor_id]);

        if (calificaciones[0].total > 0) {
            return res.status(400).json({
                success: false,
                message: 'No se puede eliminar esta asignación porque ya tiene calificaciones registradas'
            });
        }

        // Marcar como inactiva la asignación y sus horarios
        await db.execute('UPDATE profesor_asignatura_grupo SET activo = 0 WHERE id = ?', [id]);
        await db.execute('UPDATE horarios SET activo = 0 WHERE profesor_asignatura_grupo_id = ?', [id]);

        res.json({
            success: true,
            message: 'Asignación eliminada exitosamente'
        });

    } catch (error) {
        console.error('Error al eliminar asignación:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

export default router;




