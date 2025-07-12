import express from 'express';
import { db } from '../index.js';

const router = express.Router();

router.get('/asignaturas', async (req, res) => {
    try {
        const { search, area, estado, cuatrimestre } = req.query;
        
        let query = `
            SELECT a.*, c.nombre as carrera_nombre, c.codigo as carrera_codigo
            FROM asignaturas a
            JOIN carreras c ON a.carrera_id = c.id
            WHERE 1=1
        `;
        
        const params = [];
        
        if (search && search !== '') {
            query += ` AND (a.nombre LIKE ? OR a.codigo LIKE ?)`;
            params.push(`%${search}%`, `%${search}%`);
        }
        
        if (area && area !== 'todas') {
            query += ` AND c.codigo = ?`;
            params.push(area);
        }
        
        if (estado && estado !== 'todos') {
            query += ` AND a.activa = ?`;
            params.push(estado === 'activa' ? 1 : 0);
        }
        
        if (cuatrimestre) {
            query += ` AND a.cuatrimestre = ?`;
            params.push(cuatrimestre);
        }
        
        query += ` ORDER BY a.cuatrimestre, a.nombre`;
        
        const [asignaturas] = await db.execute(query, params);
        
        res.json({
            success: true,
            data: asignaturas
        });
        
    } catch (error) {
        console.error('Error al obtener asignaturas:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor',
            error: error.message
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
            message: 'Error interno del servidor',
            error: error.message
        });
    }
});

router.post('/asignaturas', async (req, res) => {
    try {
        const {
            codigo,
            nombre,
            descripcion,
            horas_teoricas,
            horas_practicas,
            complejidad,
            cuatrimestre,
            carrera_id
        } = req.body;
        
        console.log('Datos recibidos:', req.body);
        
        if (!codigo || !nombre || !cuatrimestre || !carrera_id) {
            return res.status(400).json({
                success: false,
                message: 'Los campos código, nombre, cuatrimestre y carrera son requeridos'
            });
        }
        const [existing] = await db.execute(
            'SELECT id, activa FROM asignaturas WHERE codigo = ?',
            [codigo]
        );
        
        if (existing.length > 0) {
            if (existing[0].activa) {
                return res.status(400).json({
                    success: false,
                    message: 'Ya existe una asignatura activa con este código'
                });
            } else {
                return res.status(400).json({
                    success: false,
                    message: 'Ya existe una asignatura con este código (actualmente inactiva). Use un código diferente.'
                });
            }
        }
        
        const [result] = await db.execute(`
            INSERT INTO asignaturas (
                codigo, nombre, descripcion, horas_teoricas, 
                horas_practicas, complejidad, cuatrimestre, carrera_id, activa
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE)
        `, [
            codigo, 
            nombre, 
            descripcion,
            horas_teoricas ,
            horas_practicas , 
            complejidad ,
            cuatrimestre, 
            carrera_id, 
        ]);
        
        res.json({
            success: true,
            message: 'Asignatura creada exitosamente',
            data: { id: result.insertId }
        });
        
    } catch (error) {
        console.error('Error al crear asignatura:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor',
            error: error.message
        });
    }
});
router.put('/asignaturas/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const {
            codigo,
            nombre,
            descripcion,
            horas_teoricas,
            horas_practicas,
            complejidad,
            cuatrimestre,
            carrera_id,
        } = req.body;
        const [existing] = await db.execute(
            'SELECT id FROM asignaturas WHERE codigo = ? AND id != ?',
            [codigo, id]
        );
        
        if (existing.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Ya existe otra asignatura con este código'
            });
        }
        
        await db.execute(`
            UPDATE asignaturas SET
                codigo = ?, nombre = ?, descripcion = ?, 
                horas_teoricas = ?, horas_practicas = ?, complejidad = ?,
                cuatrimestre = ?, carrera_id = ?, p
            WHERE id = ?
        `, [
            codigo, nombre, descripcion,
            horas_teoricas, horas_practicas, complejidad,
            cuatrimestre, carrera_id,  id
        ]);
        
        res.json({
            success: true,
            message: 'Asignatura actualizada exitosamente'
        });
        
    } catch (error) {
        console.error('Error al actualizar asignatura:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor',
            error: error.message
        });
    }
});

router.patch('/asignaturas/:id/estado', async (req, res) => {
    try {
        const { id } = req.params;
        const { activa } = req.body;
        
        await db.execute(
            'UPDATE asignaturas SET activa = ? WHERE id = ?',
            [activa, id]
        );
        
        res.json({
            success: true,
            message: `Asignatura ${activa ? 'activada' : 'desactivada'} exitosamente`
        });
        
    } catch (error) {
        console.error('Error al cambiar estado:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor',
            error: error.message
        });
    }
});

router.delete('/asignaturas/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        await db.execute(
            'UPDATE asignaturas SET activa = FALSE WHERE id = ?', 
            [id]
        );
        
        res.json({
            success: true,
            message: 'Asignatura desactivada exitosamente (baja lógica)'
        });
        
    } catch (error) {
        console.error('Error al desactivar asignatura:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor',
            error: error.message
        });
    }
});
router.patch('/asignaturas/:id/reactivar', async (req, res) => {
    try {
        const { id } = req.params;
        
        await db.execute(
            'UPDATE asignaturas SET activa = TRUE WHERE id = ?',
            [id]
        );
        
        res.json({
            success: true,
            message: 'Asignatura reactivada exitosamente'
        });
        
    } catch (error) {
        console.error('Error al reactivar asignatura:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor',
            error: error.message
        });
    }
});

export default router;