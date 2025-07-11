import express from 'express';
import bcrypt from 'bcrypt';
import { db } from '../index.js';

const router = express.Router();
router.post('/register', async (req, res) => {
    try {
        const { 
            nombre, 
            apellido, 
            correo, 
            contraseña, 
            rol,
            numero_empleado,
            matricula,
            carrera_id,
            cargo,
            nivel_acceso,
            fecha_contratacion,
            fecha_nombramiento,
            fecha_ingreso,
            cuatrimestre_actual,
            titulo_academico,
            especialidad,
            telefono,
            extension
        } = req.body;

        if (!nombre || !apellido || !correo || !contraseña || !rol) {
            return res.status(400).json({
                success: false,
                message: 'Nombre, apellido, correo, contraseña y rol son requeridos'
            });
        }
        const rolesValidos = ['alumno', 'profesor', 'directivo'];
        if (!rolesValidos.includes(rol)) {
            return res.status(400).json({
                success: false,
                message: 'Rol inválido. Debe ser: alumno, profesor o directivo'
            });
        }
        const [usuariosExistentes] = await db.execute(
            'SELECT id FROM usuarios WHERE correo = ?',
            [correo]
        );

        if (usuariosExistentes.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'El correo electrónico ya está registrado'
            });
        }
        const contraseñaHash = await bcrypt.hash(contraseña, 10);
        const [resultUsuario] = await db.execute(
            `INSERT INTO usuarios (nombre, apellido, correo, contraseña, rol) 
             VALUES (?, ?, ?, ?, ?)`,
            [nombre, apellido, correo, contraseñaHash, rol]
        );

        const usuarioId = resultUsuario.insertId;
        let resultadoEspecifico = null;

        if (rol === 'directivo') {
            if (!numero_empleado || !cargo || !nivel_acceso || !fecha_nombramiento) {
                await db.execute('DELETE FROM usuarios WHERE id = ?', [usuarioId]);
                return res.status(400).json({
                    success: false,
                    message: 'Para directivos se requieren: numero_empleado, cargo, nivel_acceso, fecha_nombramiento'
                });
            }
            const nivelesValidos = ['director', 'subdirector', 'coordinador'];
            if (!nivelesValidos.includes(nivel_acceso)) {
                await db.execute('DELETE FROM usuarios WHERE id = ?', [usuarioId]);
                return res.status(400).json({
                    success: false,
                    message: 'Nivel de acceso inválido. Debe ser: director, subdirector o coordinador'
                });
            }

            [resultadoEspecifico] = await db.execute(
                `INSERT INTO directivos (usuario_id, numero_empleado, cargo, carrera_id, telefono, extension, nivel_acceso, fecha_nombramiento) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [usuarioId, numero_empleado, cargo, carrera_id || null, telefono || null, extension || null, nivel_acceso, fecha_nombramiento]
            );

        } else if (rol === 'profesor') {
            if (!numero_empleado || !carrera_id || !fecha_contratacion) {
                await db.execute('DELETE FROM usuarios WHERE id = ?', [usuarioId]);
                return res.status(400).json({
                    success: false,
                    message: 'Para profesores se requieren: numero_empleado, carrera_id, fecha_contratacion'
                });
            }

            [resultadoEspecifico] = await db.execute(
                `INSERT INTO profesores (usuario_id, numero_empleado, carrera_id, telefono, extension, fecha_contratacion, titulo_academico, especialidad) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [usuarioId, numero_empleado, carrera_id, telefono || null, extension || null, fecha_contratacion, titulo_academico || null, especialidad || null]
            );

        } else if (rol === 'alumno') {
            if (!matricula || !carrera_id || !fecha_ingreso) {
                await db.execute('DELETE FROM usuarios WHERE id = ?', [usuarioId]);
                return res.status(400).json({
                    success: false,
                    message: 'Para alumnos se requieren: matricula, carrera_id, fecha_ingreso'
                });
            }

            [resultadoEspecifico] = await db.execute(
                `INSERT INTO alumnos (usuario_id, matricula, carrera_id, cuatrimestre_actual, fecha_ingreso, telefono) 
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [usuarioId, matricula, carrera_id, cuatrimestre_actual || 1, fecha_ingreso, telefono || null]
            );
        }

        res.status(201).json({
            success: true,
            message: `Usuario ${rol} registrado exitosamente`,
            data: {
                usuario_id: usuarioId,
                nombre: nombre,
                apellido: apellido,
                correo: correo,
                rol: rol,
                id_especifico: resultadoEspecifico?.insertId
            }
        });

    } catch (error) {
        console.error('Error al registrar usuario:', error);
        if (error.code === 'ER_NO_REFERENCED_ROW_2') {
            return res.status(400).json({
                success: false,
                message: 'carrera_id no válido. Verifica que la carrera exista'
            });
        }
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({
                success: false,
                message: 'Número de empleado o matrícula ya existe'
            });
        }

        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});
router.get('/carreras', async (req, res) => {
    try {
        const [carreras] = await db.execute(
            'SELECT id, nombre, codigo FROM carreras WHERE activa = TRUE ORDER BY nombre'
        );

        res.json({
            success: true,
            data: carreras
        });

    } catch (error) {
        console.error('Error al obtener carreras:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

export default router;