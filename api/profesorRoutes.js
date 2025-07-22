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

// Obtener asignaturas que imparte el profesor
router.get('/asignaturas', async (req, res) => {
    try {
        const [asignaturas] = await db.execute(`
            SELECT 
                pag.*,
                a.nombre as asignatura_nombre,
                a.codigo as asignatura_codigo,
                g.codigo as grupo_codigo,
                g.cuatrimestre,
                COUNT(ag.alumno_id) as total_estudiantes
            FROM profesor_asignatura_grupo pag
            JOIN asignaturas a ON pag.asignatura_id = a.id
            JOIN grupos g ON pag.grupo_id = g.id
            LEFT JOIN alumnos_grupos ag ON g.id = ag.grupo_id AND ag.activo = 1
            WHERE pag.profesor_id = ? AND pag.activo = 1
            GROUP BY pag.id
            ORDER BY pag.fecha_asignacion DESC
        `, [req.profesor_id]);

        res.json({
            success: true,
            data: asignaturas
        });

    } catch (error) {
        console.error('Error al obtener asignaturas:', error);
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
router.get('/solicitudes-ayuda', async (req, res) => {
    try {
        const [solicitudes] = await db.execute(`
            SELECT 
                sa.*,
                u.nombre as alumno_nombre,
                u.apellido as alumno_apellido,
                al.matricula,
                u.correo as email
            FROM solicitudes_ayuda sa
            JOIN alumnos al ON sa.alumno_id = al.id
            JOIN usuarios u ON al.usuario_id = u.id
            JOIN alumnos_grupos ag ON al.id = ag.alumno_id
            JOIN profesor_asignatura_grupo pag ON ag.grupo_id = pag.grupo_id
            WHERE pag.profesor_id = ? 
            AND pag.activo = 1
            AND ag.activo = 1
            GROUP BY sa.id
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
router.put('/solicitudes-ayuda/:id/estado', async (req, res) => {
    try {
        const { id } = req.params;
        const { estado } = req.body;

        // Verificar que la solicitud pertenece a un estudiante del profesor
        const [solicitud] = await db.execute(`
            SELECT sa.id 
            FROM solicitudes_ayuda sa
            JOIN alumnos al ON sa.alumno_id = al.id
            JOIN alumnos_grupos ag ON al.id = ag.alumno_id
            JOIN profesor_asignatura_grupo pag ON ag.grupo_id = pag.grupo_id
            WHERE sa.id = ? AND pag.profesor_id = ?
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



export default router;

