import express from 'express';
import { db } from '../index.js';

const router = express.Router();

router.get('/horarios/ingenieria', async (req, res) => {
    try {
        const { profesor, grupo } = req.query;
        
        let query = `
            SELECT h.*, 
                   a.nombre as asignatura_nombre,
                   CONCAT(u.nombre, ' ', u.apellido) as profesor_nombre,
                   g.codigo as grupo_codigo,
                   p.id as profesor_id,
                   g.id as grupo_id,
                   h.aula,
                   c.nombre as carrera_nombre,
                   c.codigo as carrera_codigo
            FROM horarios h
            JOIN profesor_asignatura_grupo pag ON h.profesor_asignatura_grupo_id = pag.id
            JOIN asignaturas a ON pag.asignatura_id = a.id
            JOIN profesores p ON pag.profesor_id = p.id
            JOIN usuarios u ON p.usuario_id = u.id
            JOIN grupos g ON pag.grupo_id = g.id
            JOIN carreras c ON g.carrera_id = c.id
            WHERE h.activo = TRUE 
            AND pag.activo = TRUE
            AND p.activo = TRUE
            AND u.activo = TRUE
        `;
        
        const params = [];
        
        if (profesor && profesor !== 'todos') {
            query += ` AND p.id = ?`;
            params.push(profesor);
        }
        
        if (grupo && grupo !== 'todos') {
            query += ` AND g.id = ?`;
            params.push(grupo);
        }
        
        query += ` ORDER BY h.dia_semana, h.hora_inicio`;
        
        const [horarios] = await db.execute(query, params);
        
        res.json({
            success: true,
            data: horarios
        });
        
    } catch (error) {
        console.error('Error al obtener horarios:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor',
            error: error.message
        });
    }
});

router.get('/horarios/tsu', async (req, res) => {
    try {
        const { profesor, grupo } = req.query;
        
        let query = `
            SELECT h.*, 
                   a.nombre as asignatura_nombre,
                   CONCAT(u.nombre, ' ', u.apellido) as profesor_nombre,
                   g.codigo as grupo_codigo,
                   p.id as profesor_id,
                   g.id as grupo_id,
                   h.aula,
                   c.nombre as carrera_nombre,
                   c.codigo as carrera_codigo
            FROM horarios h
            JOIN profesor_asignatura_grupo pag ON h.profesor_asignatura_grupo_id = pag.id
            JOIN asignaturas a ON pag.asignatura_id = a.id
            JOIN profesores p ON pag.profesor_id = p.id
            JOIN usuarios u ON p.usuario_id = u.id
            JOIN grupos g ON pag.grupo_id = g.id
            JOIN carreras c ON g.carrera_id = c.id
            WHERE h.activo = TRUE 
            AND pag.activo = TRUE
            AND p.activo = TRUE
            AND u.activo = TRUE
        `;
        
        const params = [];
        
        if (profesor && profesor !== 'todos') {
            query += ` AND p.id = ?`;
            params.push(profesor);
        }
        
        if (grupo && grupo !== 'todos') {
            query += ` AND g.id = ?`;
            params.push(grupo);
        }
        
        query += ` ORDER BY h.dia_semana, h.hora_inicio`;
        
        const [horarios] = await db.execute(query, params);
        
        res.json({
            success: true,
            data: horarios
        });
        
    } catch (error) {
        console.error('Error al obtener horarios TSU:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor',
            error: error.message
        });
    }
});

router.get('/profesores/ingenieria', async (req, res) => {
    try {
        const [profesores] = await db.execute(`
            SELECT DISTINCT p.*, u.nombre, u.apellido, c.codigo as carrera_codigo
            FROM profesores p
            JOIN usuarios u ON p.usuario_id = u.id
            JOIN carreras c ON p.carrera_id = c.id
            WHERE p.activo = TRUE 
            AND u.activo = TRUE
            ORDER BY u.apellido, u.nombre
        `);
        
        res.json({
            success: true,
            data: profesores
        });
        
    } catch (error) {
        console.error('Error al obtener profesores:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

router.get('/profesores/tsu', async (req, res) => {
    try {
        const [profesores] = await db.execute(`
            SELECT DISTINCT p.*, u.nombre, u.apellido, c.codigo as carrera_codigo
            FROM profesores p
            JOIN usuarios u ON p.usuario_id = u.id
            JOIN carreras c ON p.carrera_id = c.id
            WHERE p.activo = TRUE 
            AND u.activo = TRUE
            ORDER BY u.apellido, u.nombre
        `);
        
        res.json({
            success: true,
            data: profesores
        });
        
    } catch (error) {
        console.error('Error al obtener profesores TSU:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

router.get('/grupos/ingenieria', async (req, res) => {
    try {
        const [grupos] = await db.execute(`
            SELECT g.*, c.nombre as carrera_nombre, c.codigo as carrera_codigo
            FROM grupos g
            JOIN carreras c ON g.carrera_id = c.id
            WHERE g.activo = TRUE 
            ORDER BY g.codigo
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

router.get('/grupos/tsu', async (req, res) => {
    try {
        const [grupos] = await db.execute(`
            SELECT g.*, c.nombre as carrera_nombre, c.codigo as carrera_codigo
            FROM grupos g
            JOIN carreras c ON g.carrera_id = c.id
            WHERE g.activo = TRUE 
            ORDER BY g.codigo
        `);
        
        res.json({
            success: true,
            data: grupos
        });
        
    } catch (error) {
        console.error('Error al obtener grupos TSU:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

export default router;