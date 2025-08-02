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

/* // Crear nuevo estudiante
router.post('/', async (req, res) => {
    const connection = await db.getConnection();
    
    try {
        await connection.beginTransaction();
        
        console.log('📝 Datos recibidos:', req.body); // Debug

        const {
            nombre,
            apellido,
            correo,
            matricula,
            carrera_id,
            grupo_id, // ✅ NUEVO CAMPO REQUERIDO
            cuatrimestre_actual,
            telefono,
            fecha_ingreso,
            estado_alumno
        } = req.body;

        // ✅ Validaciones básicas (incluyendo grupo_id)
        if (!nombre || !apellido || !correo || !matricula || !carrera_id || !grupo_id || !cuatrimestre_actual || !fecha_ingreso) {
            await connection.rollback();
            return res.status(400).json({
                success: false,
                message: 'Todos los campos obligatorios deben ser completados (incluyendo el grupo)'
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
}); */

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

// ✅ AGREGAR estas rutas a profesorEstudiantesRoutes.js

// NUEVA RUTA: Obtener grupos donde el profesor es tutor
router.get('/grupos-tutor', async (req, res) => {
    try {
        const [grupos] = await db.execute(`
            SELECT 
                g.id,
                g.codigo,
                g.cuatrimestre,
                g.ciclo_escolar,
                g.periodo,
                g.capacidad_maxima,
                c.nombre as carrera_nombre,
                c.id as carrera_id,
                COUNT(ag.alumno_id) as estudiantes_actuales
            FROM grupos g
            INNER JOIN carreras c ON g.carrera_id = c.id
            LEFT JOIN alumnos_grupos ag ON g.id = ag.grupo_id AND ag.activo = 1
            WHERE g.profesor_tutor_id = ? 
            AND g.activo = 1
            GROUP BY g.id, g.codigo, g.cuatrimestre, g.ciclo_escolar, g.periodo, 
                     g.capacidad_maxima, c.nombre, c.id
            ORDER BY c.nombre, g.cuatrimestre, g.codigo
        `, [req.profesor_id]);

        res.json({
            success: true,
            data: grupos
        });

    } catch (error) {
        console.error('Error al obtener grupos del profesor:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

// ✅ REEMPLAZAR COMPLETAMENTE la ruta POST en profesorEstudiantesRoutes.js
// ✅ MODIFICAR la ruta POST en profesorEstudiantesRoutes.js

router.post('/', async (req, res) => {
    const connection = await db.getConnection();
    
    try {
        await connection.beginTransaction();
        console.log('📝 Datos recibidos (simplificados):', req.body);

        const {
            nombre,
            apellido,
            correo,
            matricula,
            grupo_id, // Solo necesitamos esto
            telefono,
            fecha_ingreso,
            estado_alumno
        } = req.body;

        // ✅ Validaciones básicas (ahora más simples)
        if (!nombre || !apellido || !correo || !matricula || !grupo_id) {
            await connection.rollback();
            return res.status(400).json({
                success: false,
                message: 'Todos los campos obligatorios deben ser completados'
            });
        }

        console.log('✅ Validaciones básicas pasadas');

        // ✅ OBTENER INFORMACIÓN COMPLETA DEL GRUPO (incluyendo carrera y cuatrimestre)
        const [grupoInfo] = await connection.execute(`
            SELECT 
                g.id,
                g.codigo,
                g.cuatrimestre,
                g.capacidad_maxima,
                g.carrera_id,
                c.nombre as carrera_nombre,
                c.duracion_cuatrimestres
            FROM grupos g
            JOIN carreras c ON g.carrera_id = c.id
            WHERE g.id = ? AND g.profesor_tutor_id = ? AND g.activo = 1
        `, [grupo_id, req.profesor_id]);

        if (grupoInfo.length === 0) {
            await connection.rollback();
            return res.status(403).json({
                success: false,
                message: 'No tienes permisos para asignar estudiantes a este grupo o el grupo no existe'
            });
        }

        const grupo = grupoInfo[0];
        console.log('✅ Información del grupo obtenida:', grupo);

        // ✅ EXTRAER automáticamente carrera_id y cuatrimestre del grupo
        const carrera_id = grupo.carrera_id;
        const cuatrimestre_actual = grupo.cuatrimestre;

        console.log(`📚 Carrera extraída: ${grupo.carrera_nombre} (ID: ${carrera_id})`);
        console.log(`📖 Cuatrimestre extraído: ${cuatrimestre_actual}°`);

        // Verificar capacidad del grupo
        const [capacidadActual] = await connection.execute(`
            SELECT COUNT(*) as estudiantes_actuales
            FROM alumnos_grupos 
            WHERE grupo_id = ? AND activo = 1
        `, [grupo_id]);

        if (capacidadActual[0].estudiantes_actuales >= grupo.capacidad_maxima) {
            await connection.rollback();
            return res.status(400).json({
                success: false,
                message: `El grupo ${grupo.codigo} ha alcanzado su capacidad máxima (${grupo.capacidad_maxima} estudiantes)`
            });
        }

        console.log('✅ Verificación de capacidad pasada');

        // Obtener el nombre completo del profesor para asignarlo como tutor
        const [profesorInfo] = await connection.execute(`
            SELECT CONCAT(u.nombre, ' ', u.apellido) as nombre_completo
            FROM profesores p
            JOIN usuarios u ON p.usuario_id = u.id
            WHERE p.id = ?
        `, [req.profesor_id]);

        const nombreProfesor = profesorInfo[0].nombre_completo;
        console.log('✅ Profesor asignado como tutor:', nombreProfesor);

        // Verificar unicidad de correo
        const [existeUsuario] = await connection.execute(
            'SELECT id FROM usuarios WHERE correo = ?',
            [correo]
        );

        if (existeUsuario.length > 0) {
            await connection.rollback();
            return res.status(400).json({
                success: false,
                message: 'Ya existe un usuario con este correo electrónico'
            });
        }

        // Verificar unicidad de matrícula
        const [existeMatricula] = await connection.execute(
            'SELECT id FROM alumnos WHERE matricula = ?',
            [matricula]
        );

        if (existeMatricula.length > 0) {
            await connection.rollback();
            return res.status(400).json({
                success: false,
                message: 'Ya existe un alumno con esta matrícula'
            });
        }

        console.log('✅ Verificaciones de unicidad pasadas');

        // 1. Crear usuario
        const contraseñaTemp = matricula; // Usar matrícula como contraseña temporal
        const contraseñaHash = await bcrypt.hash(contraseñaTemp, 10);

        const [nuevoUsuario] = await connection.execute(`
            INSERT INTO usuarios (nombre, apellido, correo, contraseña, rol, activo)
            VALUES (?, ?, ?, ?, 'alumno', 1)
        `, [nombre, apellido, correo, contraseñaHash]);

        const usuario_id = nuevoUsuario.insertId;
        console.log('✅ Usuario creado con ID:', usuario_id);

        // 2. Crear alumno (usando carrera_id y cuatrimestre extraídos del grupo)
        const [nuevoAlumno] = await connection.execute(`
            INSERT INTO alumnos (
                usuario_id, matricula, carrera_id, cuatrimestre_actual, 
                fecha_ingreso, telefono, estado_alumno, promedio_general, tutor_nombre
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 0.00, ?)
        `, [
            usuario_id, 
            matricula, 
            carrera_id, // ✅ Extraído del grupo
            cuatrimestre_actual, // ✅ Extraído del grupo
            fecha_ingreso, 
            telefono || null, 
            estado_alumno || 'activo', 
            nombreProfesor
        ]);

        const alumno_id = nuevoAlumno.insertId;
        console.log('✅ Alumno creado con ID:', alumno_id);

        // 3. Crear registro en alumnos_grupos
        const [nuevaAsignacion] = await connection.execute(`
            INSERT INTO alumnos_grupos (
                alumno_id, 
                grupo_id, 
                fecha_inscripcion, 
                activo
            ) VALUES (?, ?, NOW(), 1)
        `, [alumno_id, grupo_id]);

        const asignacion_id = nuevaAsignacion.insertId;
        console.log('✅ Asignación creada con ID:', asignacion_id);

        await connection.commit();
        console.log('✅ Transacción completada exitosamente');

        res.json({
            success: true,
            message: `✅ Estudiante ${nombre} ${apellido} creado y asignado al grupo ${grupo.codigo} correctamente`,
            data: {
                usuario_id: usuario_id,
                alumno_id: alumno_id,
                grupo_asignado: grupo_id,
                grupo_codigo: grupo.codigo,
                carrera_asignada: grupo.carrera_nombre,
                cuatrimestre_asignado: cuatrimestre_actual,
                asignacion_id: asignacion_id,
                contraseña_temporal: contraseñaTemp
            }
        });

    } catch (error) {
        await connection.rollback();
        console.error('❌ Error al crear estudiante:', error);
        
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor: ' + error.message
        });
    } finally {
        connection.release();
    }
});

// ✅ RUTA PUT SIMPLIFICADA - Reemplazar en profesorEstudiantesRoutes.js

router.put('/:id', async (req, res) => {
    const connection = await db.getConnection();
    
    try {
        await connection.beginTransaction();
        console.log('🔄 Actualizando estudiante ID:', req.params.id);
        console.log('📝 Datos recibidos:', req.body);

        const estudianteId = req.params.id;
        const {
            nombre,
            apellido,
            correo,
            matricula,
            grupo_id, // Solo necesitamos esto
            telefono,
            fecha_ingreso,
            estado_alumno
        } = req.body;

        // Validaciones básicas
        if (!nombre || !apellido || !correo || !matricula || !grupo_id) {
            await connection.rollback();
            return res.status(400).json({
                success: false,
                message: 'Todos los campos obligatorios deben ser completados'
            });
        }

        console.log('✅ Validaciones básicas pasadas');

        // Verificar que el estudiante existe y pertenece al profesor
        const [estudianteExiste] = await connection.execute(`
            SELECT 
                al.id,
                al.usuario_id,
                al.matricula as matricula_actual,
                u.correo as correo_actual,
                CONCAT(up.nombre, ' ', up.apellido) as profesor_tutor
            FROM alumnos al
            JOIN usuarios u ON al.usuario_id = u.id
            JOIN profesores p ON p.id = ?
            JOIN usuarios up ON p.usuario_id = up.id
            WHERE al.id = ? AND al.tutor_nombre = CONCAT(up.nombre, ' ', up.apellido)
        `, [req.profesor_id, estudianteId]);

        if (estudianteExiste.length === 0) {
            await connection.rollback();
            return res.status(404).json({
                success: false,
                message: 'Estudiante no encontrado o no tienes permisos para editarlo'
            });
        }

        const usuario_id = estudianteExiste[0].usuario_id;
        console.log('✅ Estudiante encontrado, usuario_id:', usuario_id);

        // ✅ OBTENER INFORMACIÓN COMPLETA DEL GRUPO NUEVO
        const [grupoInfo] = await connection.execute(`
            SELECT 
                g.id,
                g.codigo,
                g.cuatrimestre,
                g.capacidad_maxima,
                g.carrera_id,
                c.nombre as carrera_nombre
            FROM grupos g
            JOIN carreras c ON g.carrera_id = c.id
            WHERE g.id = ? AND g.profesor_tutor_id = ? AND g.activo = 1
        `, [grupo_id, req.profesor_id]);

        if (grupoInfo.length === 0) {
            await connection.rollback();
            return res.status(403).json({
                success: false,
                message: 'No tienes permisos para asignar estudiantes a este grupo'
            });
        }

        const grupo = grupoInfo[0];
        console.log('✅ Información del grupo nuevo obtenida:', grupo);

        // ✅ EXTRAER automáticamente carrera_id y cuatrimestre del grupo
        const carrera_id = grupo.carrera_id;
        const cuatrimestre_actual = grupo.cuatrimestre;

        console.log(`📚 Nueva carrera: ${grupo.carrera_nombre} (ID: ${carrera_id})`);
        console.log(`📖 Nuevo cuatrimestre: ${cuatrimestre_actual}°`);

        // Verificar capacidad del grupo (solo si está cambiando de grupo)
        const [grupoActual] = await connection.execute(`
            SELECT grupo_id 
            FROM alumnos_grupos 
            WHERE alumno_id = ? AND activo = 1
        `, [estudianteId]);

        // Si está cambiando de grupo, verificar capacidad
        if (grupoActual.length === 0 || grupoActual[0].grupo_id != grupo_id) {
            const [capacidadActual] = await connection.execute(`
                SELECT COUNT(*) as estudiantes_actuales
                FROM alumnos_grupos 
                WHERE grupo_id = ? AND activo = 1
            `, [grupo_id]);

            if (capacidadActual[0].estudiantes_actuales >= grupo.capacidad_maxima) {
                await connection.rollback();
                return res.status(400).json({
                    success: false,
                    message: `El grupo ${grupo.codigo} ha alcanzado su capacidad máxima (${grupo.capacidad_maxima} estudiantes)`
                });
            }
        }

        // Verificar unicidad de correo (si cambió)
        if (correo !== estudianteExiste[0].correo_actual) {
            const [correoExistente] = await connection.execute(
                'SELECT id FROM usuarios WHERE correo = ? AND id != ?',
                [correo, usuario_id]
            );

            if (correoExistente.length > 0) {
                await connection.rollback();
                return res.status(400).json({
                    success: false,
                    message: 'Ya existe un usuario con este correo electrónico'
                });
            }
        }

        // Verificar unicidad de matrícula (si cambió)
        if (matricula !== estudianteExiste[0].matricula_actual) {
            const [matriculaExistente] = await connection.execute(
                'SELECT id FROM alumnos WHERE matricula = ? AND id != ?',
                [matricula, estudianteId]
            );

            if (matriculaExistente.length > 0) {
                await connection.rollback();
                return res.status(400).json({
                    success: false,
                    message: 'Ya existe un estudiante con esta matrícula'
                });
            }
        }

        console.log('✅ Verificaciones de unicidad pasadas');

        // 1. Actualizar usuario
        await connection.execute(`
            UPDATE usuarios 
            SET nombre = ?, apellido = ?, correo = ?
            WHERE id = ?
        `, [nombre, apellido, correo, usuario_id]);

        console.log('✅ Usuario actualizado');

        // 2. Actualizar alumno (con carrera y cuatrimestre extraídos del grupo)
        await connection.execute(`
            UPDATE alumnos 
            SET matricula = ?, 
                carrera_id = ?, 
                cuatrimestre_actual = ?, 
                telefono = ?, 
                fecha_ingreso = ?, 
                estado_alumno = ?
            WHERE id = ?
        `, [
            matricula, 
            carrera_id, // ✅ Extraído del grupo
            cuatrimestre_actual, // ✅ Extraído del grupo
            telefono, 
            fecha_ingreso, 
            estado_alumno, 
            estudianteId
        ]);

        console.log('✅ Alumno actualizado');

        // 3. ✅ ACTUALIZAR asignación de grupo si cambió
        if (grupoActual.length === 0 || grupoActual[0].grupo_id != grupo_id) {
            console.log('🔄 Cambiando asignación de grupo...');
            
            // Desactivar asignaciones anteriores
            await connection.execute(`
                UPDATE alumnos_grupos 
                SET activo = 0, fecha_salida = NOW()
                WHERE alumno_id = ? AND activo = 1
            `, [estudianteId]);

            // Verificar si ya existe una asignación a este grupo
            const [asignacionExistente] = await connection.execute(`
                SELECT id FROM alumnos_grupos 
                WHERE alumno_id = ? AND grupo_id = ?
            `, [estudianteId, grupo_id]);

            if (asignacionExistente.length > 0) {
                // Reactivar asignación existente
                await connection.execute(`
                    UPDATE alumnos_grupos 
                    SET activo = 1, fecha_salida = NULL
                    WHERE alumno_id = ? AND grupo_id = ?
                `, [estudianteId, grupo_id]);
                console.log('✅ Asignación de grupo reactivada');
            } else {
                // Crear nueva asignación
                const [nuevaAsignacion] = await connection.execute(`
                    INSERT INTO alumnos_grupos (
                        alumno_id, 
                        grupo_id, 
                        fecha_inscripcion, 
                        activo
                    ) VALUES (?, ?, NOW(), 1)
                `, [estudianteId, grupo_id]);
                console.log('✅ Nueva asignación de grupo creada:', nuevaAsignacion.insertId);
            }
        } else {
            console.log('ℹ️ Sin cambio de grupo');
        }

        await connection.commit();
        console.log('✅ Actualización completada exitosamente');

        res.json({
            success: true,
            message: `✅ Estudiante ${nombre} ${apellido} actualizado correctamente`,
            data: {
                estudiante_id: estudianteId,
                usuario_id: usuario_id,
                grupo_asignado: grupo_id,
                grupo_codigo: grupo.codigo,
                carrera_asignada: grupo.carrera_nombre,
                cuatrimestre_asignado: cuatrimestre_actual,
                cambio_de_grupo: grupoActual.length === 0 || grupoActual[0].grupo_id != grupo_id
            }
        });

    } catch (error) {
        await connection.rollback();
        console.error('❌ Error al actualizar estudiante:', error);
        
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor: ' + error.message
        });
    } finally {
        connection.release();
    }
});

// ✅ TAMBIÉN ACTUALIZAR la ruta GET para incluir grupo_id en la respuesta
// (para que el modal de edición funcione correctamente)

router.get('/', async (req, res) => {
    try {
        // Obtener el nombre completo del profesor
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

        // ✅ MODIFICADA: Incluir grupo_id en la consulta
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
                g.id as grupo_id,
                g.codigo as grupo_codigo,
                g.cuatrimestre as grupo_cuatrimestre
            FROM alumnos al
            JOIN usuarios u ON al.usuario_id = u.id
            JOIN carreras c ON al.carrera_id = c.id
            LEFT JOIN alumnos_grupos ag ON al.id = ag.alumno_id AND ag.activo = 1
            LEFT JOIN grupos g ON ag.grupo_id = g.id
            WHERE al.tutor_nombre = ?
            AND u.activo = 1
            ORDER BY u.apellido, u.nombre
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



// También agregar esta consulta para verificar manualmente
router.get('/debug/verificar-grupos', async (req, res) => {
    try {
        // Verificar tabla alumnos_grupos
        const [registros] = await db.execute('SELECT * FROM alumnos_grupos ORDER BY id DESC LIMIT 10');
        
        // Verificar grupos del profesor
        const [grupos] = await db.execute(`
            SELECT g.id, g.codigo, g.profesor_tutor_id 
            FROM grupos g 
            WHERE g.profesor_tutor_id = ?
        `, [req.profesor_id]);

        res.json({
            success: true,
            data: {
                ultimos_registros_alumnos_grupos: registros,
                grupos_del_profesor: grupos,
                profesor_id: req.profesor_id
            }
        });
    } catch (error) {
        console.error('Error en debug:', error);
        res.status(500).json({ error: error.message });
    }
});

export default router;