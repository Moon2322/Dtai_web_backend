import express from 'express';
import bcrypt from 'bcrypt';
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

// Obtener todos los estudiantes del profesor
router.get('/', async (req, res) => {
    try {
        // Primero obtenemos el nombre completo del profesor
        const [profesorInfo] = await db.execute(`
            SELECT CONCAT(u.nombre, ' ', u.apellido) as nombre_completo
            FROM profesores p
            JOIN usuarios u ON p.usuario_id = u.id
            WHERE p.id = ?
        `, [req.profesor_id]);

        if (profesorInfo.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Información del profesor no encontrada'
            });
        }

        const nombreProfesor = profesorInfo[0].nombre_completo;

        // Obtener estudiantes donde el tutor_nombre coincide con el nombre del profesor
        const [estudiantes] = await db.execute(`
            SELECT 
                al.id,
                al.matricula,
                al.cuatrimestre_actual,
                al.fecha_ingreso,
                al.telefono,
                al.estado_alumno,
                al.promedio_general,
                al.tutor_nombre,
                u.nombre,
                u.apellido,
                u.correo,
                CONCAT(u.nombre, ' ', u.apellido) as nombre_completo,
                c.id as carrera_id,
                c.nombre as carrera_nombre,
                g.codigo as grupo_codigo
            FROM alumnos al
            JOIN usuarios u ON al.usuario_id = u.id
            JOIN carreras c ON al.carrera_id = c.id
            LEFT JOIN alumnos_grupos ag ON al.id = ag.alumno_id AND ag.activo = 1
            LEFT JOIN grupos g ON ag.grupo_id = g.id
            WHERE al.tutor_nombre = ?
            AND u.activo = 1
            ORDER BY u.nombre, u.apellido
        `, [nombreProfesor]);

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

// Crear nuevo estudiante
router.post('/', async (req, res) => {
    try {
        const {
            nombre,
            apellido,
            correo,
            matricula,
            carrera_id,
            cuatrimestre_actual,
            telefono,
            fecha_ingreso,
            estado_alumno
        } = req.body;

        // Validaciones
        if (!nombre || !apellido || !correo || !matricula || !carrera_id || !cuatrimestre_actual || !fecha_ingreso) {
            return res.status(400).json({
                success: false,
                message: 'Todos los campos obligatorios deben ser completados'
            });
        }

        // Obtener el nombre completo del profesor para asignarlo como tutor
        const [profesorInfo] = await db.execute(`
            SELECT CONCAT(u.nombre, ' ', u.apellido) as nombre_completo
            FROM profesores p
            JOIN usuarios u ON p.usuario_id = u.id
            WHERE p.id = ?
        `, [req.profesor_id]);

        const nombreProfesor = profesorInfo[0].nombre_completo;

        // Verificar si ya existe el email o matrícula
        const [existeUsuario] = await db.execute(
            'SELECT id FROM usuarios WHERE correo = ?',
            [correo]
        );

        if (existeUsuario.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Ya existe un usuario con este correo electrónico'
            });
        }

        const [existeMatricula] = await db.execute(
            'SELECT id FROM alumnos WHERE matricula = ?',
            [matricula]
        );

        if (existeMatricula.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Ya existe un alumno con esta matrícula'
            });
        }

        // Crear usuario
        const contraseñaTemp = matricula; // Usar matrícula como contraseña temporal
        const contraseñaHash = await bcrypt.hash(contraseñaTemp, 10);

        const [nuevoUsuario] = await db.execute(`
            INSERT INTO usuarios (nombre, apellido, correo, contraseña, rol, activo)
            VALUES (?, ?, ?, ?, 'alumno', 1)
        `, [nombre, apellido, correo, contraseñaHash]);

        const usuario_id = nuevoUsuario.insertId;

        // Crear alumno con el profesor como tutor
        const [nuevoAlumno] = await db.execute(`
            INSERT INTO alumnos (
                usuario_id, matricula, carrera_id, cuatrimestre_actual, 
                fecha_ingreso, telefono, estado_alumno, promedio_general, tutor_nombre
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 0.00, ?)
        `, [usuario_id, matricula, carrera_id, cuatrimestre_actual, fecha_ingreso, telefono, estado_alumno, nombreProfesor]);

        res.json({
            success: true,
            message: 'Estudiante creado exitosamente',
            data: { id: nuevoAlumno.insertId }
        });

    } catch (error) {
        console.error('Error al crear estudiante:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

// Actualizar estudiante
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const {
            nombre,
            apellido,
            correo,
            matricula,
            carrera_id,
            cuatrimestre_actual,
            telefono,
            fecha_ingreso,
            estado_alumno
        } = req.body;

        // Obtener el nombre completo del profesor
        const [profesorInfo] = await db.execute(`
            SELECT CONCAT(u.nombre, ' ', u.apellido) as nombre_completo
            FROM profesores p
            JOIN usuarios u ON p.usuario_id = u.id
            WHERE p.id = ?
        `, [req.profesor_id]);

        const nombreProfesor = profesorInfo[0].nombre_completo;

        // Verificar que el estudiante pertenece al profesor (por tutor_nombre)
        const [estudianteExiste] = await db.execute(`
            SELECT al.id, al.usuario_id 
            FROM alumnos al
            WHERE al.id = ? AND al.tutor_nombre = ?
        `, [id, nombreProfesor]);

        if (estudianteExiste.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Estudiante no encontrado en tu lista de tutorados'
            });
        }

        const usuario_id = estudianteExiste[0].usuario_id;

        // Verificar que el correo no esté en uso por otro usuario
        const [correoEnUso] = await db.execute(
            'SELECT id FROM usuarios WHERE correo = ? AND id != ?',
            [correo, usuario_id]
        );

        if (correoEnUso.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'El correo ya está en uso por otro usuario'
            });
        }

        // Verificar que la matrícula no esté en uso por otro alumno
        const [matriculaEnUso] = await db.execute(
            'SELECT id FROM alumnos WHERE matricula = ? AND id != ?',
            [matricula, id]
        );

        if (matriculaEnUso.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'La matrícula ya está en uso por otro alumno'
            });
        }

        // Actualizar usuario
        await db.execute(`
            UPDATE usuarios 
            SET nombre = ?, apellido = ?, correo = ?
            WHERE id = ?
        `, [nombre, apellido, correo, usuario_id]);

        // Actualizar alumno
        await db.execute(`
            UPDATE alumnos 
            SET matricula = ?, carrera_id = ?, cuatrimestre_actual = ?, 
                fecha_ingreso = ?, telefono = ?, estado_alumno = ?
            WHERE id = ?
        `, [matricula, carrera_id, cuatrimestre_actual, fecha_ingreso, telefono, estado_alumno, id]);

        res.json({
            success: true,
            message: 'Estudiante actualizado exitosamente'
        });

    } catch (error) {
        console.error('Error al actualizar estudiante:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

// Cambiar estado del estudiante
router.put('/:id/estado', async (req, res) => {
    try {
        const { id } = req.params;
        const { estado } = req.body;

        // Obtener el nombre completo del profesor
        const [profesorInfo] = await db.execute(`
            SELECT CONCAT(u.nombre, ' ', u.apellido) as nombre_completo
            FROM profesores p
            JOIN usuarios u ON p.usuario_id = u.id
            WHERE p.id = ?
        `, [req.profesor_id]);

        const nombreProfesor = profesorInfo[0].nombre_completo;

        // Verificar que el estudiante pertenece al profesor (por tutor_nombre)
        const [estudianteExiste] = await db.execute(`
            SELECT al.id 
            FROM alumnos al
            WHERE al.id = ? AND al.tutor_nombre = ?
        `, [id, nombreProfesor]);

        if (estudianteExiste.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Estudiante no encontrado en tu lista de tutorados'
            });
        }

        await db.execute(
            'UPDATE alumnos SET estado_alumno = ? WHERE id = ?',
            [estado, id]
        );

        res.json({
            success: true,
            message: 'Estado del estudiante actualizado exitosamente'
        });

    } catch (error) {
        console.error('Error al cambiar estado del estudiante:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

// Eliminar estudiante (marcar como inactivo)
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // Obtener el nombre completo del profesor
        const [profesorInfo] = await db.execute(`
            SELECT CONCAT(u.nombre, ' ', u.apellido) as nombre_completo
            FROM profesores p
            JOIN usuarios u ON p.usuario_id = u.id
            WHERE p.id = ?
        `, [req.profesor_id]);

        const nombreProfesor = profesorInfo[0].nombre_completo;

        // Verificar que el estudiante pertenece al profesor (por tutor_nombre)
        const [estudianteExiste] = await db.execute(`
            SELECT al.id, al.usuario_id 
            FROM alumnos al
            WHERE al.id = ? AND al.tutor_nombre = ?
        `, [id, nombreProfesor]);

        if (estudianteExiste.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Estudiante no encontrado en tu lista de tutorados'
            });
        }

        const usuario_id = estudianteExiste[0].usuario_id;

        // Marcar como inactivo en lugar de eliminar
        await db.execute(
            'UPDATE usuarios SET activo = 0 WHERE id = ?',
            [usuario_id]
        );

        await db.execute(
            'UPDATE alumnos SET estado_alumno = ? WHERE id = ?',
            ['baja_definitiva', id]
        );

        res.json({
            success: true,
            message: 'Estudiante eliminado exitosamente'
        });

    } catch (error) {
        console.error('Error al eliminar estudiante:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

// Obtener estadísticas de estudiantes del profesor
router.get('/estadisticas', async (req, res) => {
    try {
        // Obtener el nombre completo del profesor
        const [profesorInfo] = await db.execute(`
            SELECT CONCAT(u.nombre, ' ', u.apellido) as nombre_completo
            FROM profesores p
            JOIN usuarios u ON p.usuario_id = u.id
            WHERE p.id = ?
        `, [req.profesor_id]);

        const nombreProfesor = profesorInfo[0].nombre_completo;

        // Total de estudiantes
        const [total] = await db.execute(`
            SELECT COUNT(*) as total
            FROM alumnos al
            WHERE al.tutor_nombre = ?
        `, [nombreProfesor]);

        // Por estado
        const [porEstado] = await db.execute(`
            SELECT 
                al.estado_alumno,
                COUNT(*) as cantidad
            FROM alumnos al
            WHERE al.tutor_nombre = ?
            GROUP BY al.estado_alumno
        `, [nombreProfesor]);

        // Promedio general
        const [promedio] = await db.execute(`
            SELECT AVG(al.promedio_general) as promedio_general
            FROM alumnos al
            WHERE al.tutor_nombre = ?
            AND al.promedio_general > 0
        `, [nombreProfesor]);

        res.json({
            success: true,
            data: {
                total: total[0].total,
                por_estado: porEstado,
                promedio_general: promedio[0].promedio_general ? parseFloat(promedio[0].promedio_general).toFixed(2) : '0.00'
            }
        });

    } catch (error) {
        console.error('Error al obtener estadísticas de estudiantes:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

export default router;