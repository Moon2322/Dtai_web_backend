import express from 'express';
import bcrypt from 'bcrypt';
import { db } from '../index.js';

const router = express.Router();
router.get('/profesores', async (req, res) => {
    try {
        const { search, area, estado } = req.query;
        
        let query = `
            SELECT p.*, u.nombre, u.apellido, u.correo, u.activo as usuario_activo,
                   c.nombre as carrera_nombre, c.codigo as carrera_codigo
            FROM profesores p
            JOIN usuarios u ON p.usuario_id = u.id
            JOIN carreras c ON p.carrera_id = c.id
            WHERE 1=1
        `;
        
        const params = [];
        
        if (search && search !== '') {
            query += ` AND (u.nombre LIKE ? OR u.apellido LIKE ? OR p.numero_empleado LIKE ? OR u.correo LIKE ?)`;
            params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
        }
        if (area === 'ingenieria') {
            query += ` AND c.codigo IN ('ISC', 'II', 'LA')`;
        } else if (area === 'tsu') {
            query += ` AND c.codigo IN ('TSU-DS', 'TSU-TI')`;
        } else if (area && area !== 'todas' && area !== 'ingenieria' && area !== 'tsu') {
            query += ` AND c.codigo = ?`;
            params.push(area);
        }
        
        if (estado && estado !== 'todos') {
            query += ` AND p.activo = ?`;
            params.push(estado === 'activo' ? 1 : 0);
        }
        
        query += ` ORDER BY u.apellido, u.nombre`;
        
        const [profesores] = await db.execute(query, params);
        
        res.json({
            success: true,
            data: profesores
        });
        
    } catch (error) {
        console.error('Error al obtener profesores:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor',
            error: error.message
        });
    }
});
router.get('/profesores/stats', async (req, res) => {
    try {
        const [totalProfesores] = await db.execute(`
            SELECT COUNT(*) as total FROM profesores p
            JOIN usuarios u ON p.usuario_id = u.id
            WHERE p.activo = TRUE AND u.activo = TRUE
        `);
        
        const [areasAcademicas] = await db.execute(`
            SELECT COUNT(DISTINCT c.id) as total FROM carreras c
            WHERE c.activa = TRUE
        `);
        
        res.json({
            success: true,
            data: {
                totalProfesores: totalProfesores[0].total,
                areasAcademicas: areasAcademicas[0].total
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
router.post('/profesores', async (req, res) => {
    try {
        const {
            nombre,
            apellido,
            correo,
            contraseña,
            telefono,
            numero_empleado,
            carrera_id,
            fecha_contratacion,
            titulo_academico,
            especialidad,
            cedula_profesional,
            experiencia_años
        } = req.body;
        if (!nombre || !apellido || !correo || !contraseña || !numero_empleado || !carrera_id || !fecha_contratacion) {
            return res.status(400).json({
                success: false,
                message: 'Los campos nombre, apellido, correo, contraseña, número de empleado, carrera y fecha de contratación son requeridos'
            });
        }
        const [existingEmail] = await db.execute(
            'SELECT id FROM usuarios WHERE correo = ?',
            [correo]
        );
        
        if (existingEmail.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Ya existe un usuario con este correo electrónico'
            });
        }
        const [existingEmployee] = await db.execute(
            'SELECT id FROM profesores WHERE numero_empleado = ?',
            [numero_empleado]
        );
        
        if (existingEmployee.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Ya existe un profesor con este número de empleado'
            });
        }
        const hashedPassword = await bcrypt.hash(contraseña, 10);
        const connection = await db.getConnection();
        await connection.beginTransaction();
        
        try {
            const [userResult] = await connection.execute(`
                INSERT INTO usuarios (nombre, apellido, correo, contraseña, rol, activo)
                VALUES (?, ?, ?, ?, 'profesor', TRUE)
            `, [nombre, apellido, correo, hashedPassword]);
            
            const userId = userResult.insertId;
            const [profesorResult] = await connection.execute(`
                INSERT INTO profesores (
                    usuario_id, numero_empleado, carrera_id, telefono,
                    fecha_contratacion, titulo_academico, especialidad,
                    cedula_profesional, experiencia_años, activo
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE)
            `, [
                userId, numero_empleado, carrera_id, telefono || null,
                fecha_contratacion, titulo_academico || null, especialidad || null,
                cedula_profesional || null, experiencia_años || 0
            ]);
            
            await connection.commit();
            connection.release();
            
            res.json({
                success: true,
                message: 'Profesor creado exitosamente',
                data: { id: profesorResult.insertId }
            });
            
        } catch (error) {
            await connection.rollback();
            connection.release();
            throw error;
        }
        
    } catch (error) {
        console.error('Error al crear profesor:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor',
            error: error.message
        });
    }
});
router.put('/profesores/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const {
            nombre,
            apellido,
            correo,
            telefono,
            numero_empleado,
            carrera_id,
            fecha_contratacion,
            titulo_academico,
            especialidad,
            cedula_profesional,
            experiencia_años
        } = req.body;
        const [profesor] = await db.execute(
            'SELECT usuario_id FROM profesores WHERE id = ?',
            [id]
        );
        
        if (profesor.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Profesor no encontrado'
            });
        }
        
        const userId = profesor[0].usuario_id;
        const [existingEmail] = await db.execute(
            'SELECT id FROM usuarios WHERE correo = ? AND id != ?',
            [correo, userId]
        );
        
        if (existingEmail.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Ya existe otro usuario con este correo electrónico'
            });
        }
        const [existingEmployee] = await db.execute(
            'SELECT id FROM profesores WHERE numero_empleado = ? AND id != ?',
            [numero_empleado, id]
        );
        
        if (existingEmployee.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Ya existe otro profesor con este número de empleado'
            });
        }
        const connection = await db.getConnection();
        await connection.beginTransaction();
        
        try {
            await connection.execute(`
                UPDATE usuarios SET
                    nombre = ?, apellido = ?, correo = ?
                WHERE id = ?
            `, [nombre, apellido, correo, userId]);
            await connection.execute(`
                UPDATE profesores SET
                    numero_empleado = ?, carrera_id = ?, telefono = ?,
                    fecha_contratacion = ?, titulo_academico = ?, especialidad = ?,
                    cedula_profesional = ?, experiencia_años = ?
                WHERE id = ?
            `, [
                numero_empleado, carrera_id, telefono,
                fecha_contratacion, titulo_academico, especialidad,
                cedula_profesional, experiencia_años, id
            ]);
            
            await connection.commit();
            connection.release();
            
            res.json({
                success: true,
                message: 'Profesor actualizado exitosamente'
            });
            
        } catch (error) {
            await connection.rollback();
            connection.release();
            throw error;
        }
        
    } catch (error) {
        console.error('Error al actualizar profesor:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor',
            error: error.message
        });
    }
});
router.delete('/profesores/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await db.execute(
            'UPDATE profesores SET activo = FALSE WHERE id = ?', 
            [id]
        );
        await db.execute(`
            UPDATE usuarios SET activo = FALSE 
            WHERE id = (SELECT usuario_id FROM profesores WHERE id = ?)
        `, [id]);
        
        res.json({
            success: true,
            message: 'Profesor desactivado exitosamente (baja lógica)'
        });
        
    } catch (error) {
        console.error('Error al desactivar profesor:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor',
            error: error.message
        });
    }
});
router.patch('/profesores/:id/reactivar', async (req, res) => {
    try {
        const { id } = req.params;
        
        await db.execute(
            'UPDATE profesores SET activo = TRUE WHERE id = ?',
            [id]
        );
        await db.execute(`
            UPDATE usuarios SET activo = TRUE 
            WHERE id = (SELECT usuario_id FROM profesores WHERE id = ?)
        `, [id]);
        
        res.json({
            success: true,
            message: 'Profesor reactivado exitosamente'
        });
        
    } catch (error) {
        console.error('Error al reactivar profesor:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor',
            error: error.message
        });
    }
});

export default router;