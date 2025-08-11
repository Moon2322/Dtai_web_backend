// api/reportesRiesgoRoutes.js
import express from 'express';
import { verifyToken } from '../middleware/auth.js';
import { db } from '../index.js';

const router = express.Router();

// ============== OBTENER TODOS LOS REPORTES ==============
// GET /api/reportes-riesgo



router.get('/reportes-riesgo', verifyToken, async (req, res) => {
    try {
        const { page = 1, limit = 10, tipo_riesgo, nivel_riesgo, estado } = req.query;
        
        let query = `
            SELECT 
                rr.*,
                ua.nombre as alumno_nombre, 
                ua.apellido as alumno_apellido,
                a.matricula,
                up.nombre as profesor_nombre, 
                up.apellido as profesor_apellido,
                c.nombre as carrera_nombre
            FROM reportes_riesgo rr
            JOIN alumnos a ON rr.alumno_id = a.id
            JOIN usuarios ua ON a.usuario_id = ua.id
            JOIN profesores p ON rr.profesor_id = p.id
            JOIN usuarios up ON p.usuario_id = up.id
            JOIN carreras c ON a.carrera_id = c.id
            WHERE 1 = 1
        `;
        
        const params = [];
        
        // Filtros opcionales
        if (tipo_riesgo) {
            query += ' AND rr.tipo_riesgo = ?';
            params.push(tipo_riesgo);
        }
        
        if (nivel_riesgo) {
            query += ' AND rr.nivel_riesgo = ?';
            params.push(nivel_riesgo);
        }
        
        if (estado) {
            query += ' AND rr.estado = ?';
            params.push(estado);
        }
        
        query += ' ORDER BY rr.fecha_reporte DESC';
        
        // Paginación
        const offset = (page - 1) * limit;
        query += ' LIMIT ? OFFSET ?';
        params.push(parseInt(limit), parseInt(offset));
        
        const [reportes] = await db.execute(query, params);
        
        // Contar total de reportes para paginación
        let countQuery = `
            SELECT COUNT(*) as total
            FROM reportes_riesgo rr
            JOIN alumnos a ON rr.alumno_id = a.id
            WHERE 1 = 1
        `;
        const countParams = [];
        
        if (tipo_riesgo) {
            countQuery += ' AND rr.tipo_riesgo = ?';
            countParams.push(tipo_riesgo);
        }
        
        if (nivel_riesgo) {
            countQuery += ' AND rr.nivel_riesgo = ?';
            countParams.push(nivel_riesgo);
        }
        
        if (estado) {
            countQuery += ' AND rr.estado = ?';
            countParams.push(estado);
        }
        
        const [countResult] = await db.execute(countQuery, countParams);
        const total = countResult[0].total;
        
        res.json({
            success: true,
            data: {
                reportes,
                pagination: {
                    current_page: parseInt(page),
                    total_pages: Math.ceil(total / limit),
                    total_items: total,
                    items_per_page: parseInt(limit)
                }
            }
        });
        
    } catch (error) {
        console.error('Error al obtener reportes de riesgo:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

// ============== OBTENER UN REPORTE ESPECÍFICO ==============
// GET /api/reportes-riesgo/:id
router.get('/reportes-riesgo/:id', verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        
        const [reportes] = await db.execute(`
            SELECT 
                rr.*,
                ua.nombre as alumno_nombre, 
                ua.apellido as alumno_apellido,
                a.matricula,
                a.cuatrimestre_actual,
                up.nombre as profesor_nombre, 
                up.apellido as profesor_apellido,
                c.nombre as carrera_nombre
            FROM reportes_riesgo rr
            JOIN alumnos a ON rr.alumno_id = a.id
            JOIN usuarios ua ON a.usuario_id = ua.id
            JOIN profesores p ON rr.profesor_id = p.id
            JOIN usuarios up ON p.usuario_id = up.id
            JOIN carreras c ON a.carrera_id = c.id
            WHERE rr.id = ?
        `, [id]);
        
        if (reportes.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Reporte no encontrado'
            });
        }
        
        // Obtener seguimiento del reporte
        const [seguimiento] = await db.execute(`
            SELECT 
                sr.*,
                u.nombre, 
                u.apellido
            FROM seguimiento_reportes sr
            JOIN usuarios u ON sr.usuario_id = u.id
            WHERE sr.reporte_id = ?
            ORDER BY sr.fecha_accion DESC
        `, [id]);
        
        res.json({
            success: true,
            data: {
                reporte: reportes[0],
                seguimiento
            }
        });
        
    } catch (error) {
        console.error('Error al obtener reporte:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

// ============== CREAR NUEVO REPORTE ==============
// POST /api/reportes-riesgo
router.post('/reportes-riesgo', verifyToken, async (req, res) => {
    try {
        const {
            alumno_id,
            tipo_riesgo,
            nivel_riesgo,
            descripcion,
            observaciones,
            acciones_recomendadas
        } = req.body;
        
        // Validaciones básicas
        if (!alumno_id || !tipo_riesgo || !nivel_riesgo || !descripcion) {
            return res.status(400).json({
                success: false,
                message: 'Faltan campos requeridos: alumno_id, tipo_riesgo, nivel_riesgo, descripcion'
            });
        }
        
        // Obtener el ID del profesor desde el token
        const userEmail = req.user.correo;
       // En la función crearReporte, después de obtener el profesor:
const [profesor] = await db.execute(`
    SELECT p.id, p.usuario_id 
    FROM profesores p 
    JOIN usuarios u ON p.usuario_id = u.id 
    WHERE u.correo = ? AND p.activo = 1
`, [userEmail]);

// ✅ AGREGAR ESTE DEBUG:
console.log('🔍 DEBUG - Objeto profesor completo:', profesor);
console.log('🔍 DEBUG - profesor[0]:', profesor[0]);
console.log('🔍 DEBUG - req.user:', req.user);
        
        if (profesor.length === 0) {
            return res.status(403).json({
                success: false,
                message: 'Solo los profesores pueden crear reportes de riesgo'
            });
        }
        
        const profesor_id = profesor[0].id;
        
        // Verificar que el alumno existe
        const [alumno] = await db.execute(`
    SELECT id FROM alumnos WHERE id = ? AND estado_alumno = 'activo'
        `, [alumno_id]);
        
        if (alumno.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Alumno no encontrado'
            });
        }
        
        // Insertar el reporte
        const [resultado] = await db.execute(`
            INSERT INTO reportes_riesgo 
            (alumno_id, profesor_id, tipo_riesgo, nivel_riesgo, descripcion, observaciones, acciones_recomendadas)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [alumno_id, profesor_id, tipo_riesgo, nivel_riesgo, descripcion, observaciones, acciones_recomendadas]);
        
        // Crear registro de seguimiento
        await db.execute(`
            INSERT INTO seguimiento_reportes 
    (reporte_id, usuario_id, accion, comentario)
    VALUES (?, ?, 'creado', 'Reporte creado inicialmente')
`, [resultado.insertId, profesor[0].usuario_id]);
        
        res.status(201).json({
            success: true,
            message: 'Reporte de riesgo creado exitosamente',
            data: {
                id: resultado.insertId
            }
        });
        
    } catch (error) {
        console.error('Error al crear reporte:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

// ============== ACTUALIZAR REPORTE ==============
// PUT /api/reportes-riesgo/:id
router.put('/reportes-riesgo/:id', verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        const {
            tipo_riesgo,
            nivel_riesgo,
            descripcion,
            observaciones,
            acciones_recomendadas,
            estado,
            resolucion,
            comentario_seguimiento
        } = req.body;
        
        // Verificar que el reporte existe
        const [reporteExistente] = await db.execute(`
            SELECT * FROM reportes_riesgo WHERE id = ?
        `, [id]);
        
        if (reporteExistente.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Reporte no encontrado'
            });
        }
        
        // Construir la query de actualización dinámicamente
        const camposActualizar = [];
        const valores = [];
        
        if (tipo_riesgo) {
            camposActualizar.push('tipo_riesgo = ?');
            valores.push(tipo_riesgo);
        }
        
        if (nivel_riesgo) {
            camposActualizar.push('nivel_riesgo = ?');
            valores.push(nivel_riesgo);
        }
        
        if (descripcion) {
            camposActualizar.push('descripcion = ?');
            valores.push(descripcion);
        }
        
        if (observaciones !== undefined) {
            camposActualizar.push('observaciones = ?');
            valores.push(observaciones);
        }
        
        if (acciones_recomendadas !== undefined) {
            camposActualizar.push('acciones_recomendadas = ?');
            valores.push(acciones_recomendadas);
        }
        
        if (estado) {
            camposActualizar.push('estado = ?');
            valores.push(estado);
        }
        
        if (resolucion !== undefined) {
            camposActualizar.push('resolucion = ?');
            valores.push(resolucion);
        }
        
        if (camposActualizar.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No se proporcionaron campos para actualizar'
            });
        }
        
        valores.push(id);
        
        // Actualizar el reporte
        await db.execute(`
            UPDATE reportes_riesgo 
            SET ${camposActualizar.join(', ')}
            WHERE id = ?
        `, valores);
        
        // Crear registro de seguimiento si hay comentario
        // ✅ OBTENER EL USUARIO_ID DEL PROFESOR ACTUAL:
if (comentario_seguimiento) {
    let accion = 'comentario_agregado';
    if (estado === 'resuelto') accion = 'resuelto';
    if (estado === 'cerrado') accion = 'cerrado';
    if (estado === 'en_proceso') accion = 'en_revision';
    
    // Obtener el usuario_id del profesor
    const userEmail = req.user.correo;
    const [profesor] = await db.execute(`
        SELECT p.usuario_id 
        FROM profesores p 
        JOIN usuarios u ON p.usuario_id = u.id 
        WHERE u.correo = ?
    `, [userEmail]);
    
    if (profesor.length > 0) {
        await db.execute(`
            INSERT INTO seguimiento_reportes 
            (reporte_id, usuario_id, accion, comentario)
            VALUES (?, ?, ?, ?)
        `, [id, profesor[0].usuario_id, accion, comentario_seguimiento]);
    }
}
        
        res.json({
            success: true,
            message: 'Reporte actualizado exitosamente'
        });
        
    } catch (error) {
        console.error('Error al actualizar reporte:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

// ============== ELIMINAR REPORTE ==============
// DELETE /api/reportes-riesgo/:id
router.delete('/reportes-riesgo/:id', verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        
        // Verificar que el reporte existe
        const [reporteExistente] = await db.execute(`
            SELECT * FROM reportes_riesgo WHERE id = ?
        `, [id]);
        
        if (reporteExistente.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Reporte no encontrado'
            });
        }
        
        // Eliminar el reporte (esto también eliminará los seguimientos por CASCADE)
        await db.execute(`
            DELETE FROM reportes_riesgo WHERE id = ?
        `, [id]);
        
        res.json({
            success: true,
            message: 'Reporte eliminado exitosamente'
        });
        
    } catch (error) {
        console.error('Error al eliminar reporte:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});


// ============== OBTENER ALUMNOS PARA DROPDOWN (SOLO TUTORADOS) ==============
// GET /api/reportes-riesgo/alumnos/search
router.get('/reportes-riesgo/alumnos/search', verifyToken, async (req, res) => {
    try {
        const { q = '' } = req.query;
        
        // Obtener el ID del profesor desde el token
        const userEmail = req.user.correo;
const [profesor] = await db.execute(`
    SELECT p.id, p.usuario_id 
    FROM profesores p 
    JOIN usuarios u ON p.usuario_id = u.id 
    WHERE u.correo = ? AND p.activo = 1
`, [userEmail]);
        
        if (profesor.length === 0) {
            return res.status(403).json({
                success: false,
                message: 'Solo los profesores pueden buscar alumnos'
            });
        }
        
        const profesor_id = profesor[0].id;
        console.log('🆔 Profesor ID:', profesor_id);
        
        // ✅ PASO 1: Buscar grupos donde este profesor es tutor
        const [gruposTutor] = await db.execute(`
            SELECT g.id, g.codigo 
            FROM grupos g 
            WHERE g.profesor_tutor_id = ? AND g.activo = TRUE
        `, [profesor_id]);
        
        console.log('👥 Grupos donde es tutor:', gruposTutor);
        
        if (gruposTutor.length === 0) {
            return res.json({
                success: true,
                data: [],
                message: 'No tienes grupos asignados como tutor'
            });
        }
        
        // ✅ PASO 2: Buscar alumnos en esos grupos
        const grupoIds = gruposTutor.map(g => g.id);
        const placeholders = grupoIds.map(() => '?').join(',');
        
        let query = `
            SELECT 
                al.id,
                al.matricula,
                u.nombre,
                u.apellido,
                c.nombre as carrera_nombre,
                al.cuatrimestre_actual,
                g.codigo as grupo_codigo,
                CONCAT(u.nombre, ' ', u.apellido) as nombre_completo
            FROM alumnos_grupos ag
            JOIN alumnos al ON ag.alumno_id = al.id
            JOIN usuarios u ON al.usuario_id = u.id
            JOIN grupos g ON ag.grupo_id = g.id
            JOIN carreras c ON al.carrera_id = c.id
            WHERE ag.grupo_id IN (${placeholders})
            AND ag.activo = TRUE
            AND u.activo = TRUE
            AND al.estado_alumno = 'activo'
        `;
        
        let params = [...grupoIds];
        
        // Solo agregar filtro de búsqueda si hay término
        if (q.trim()) {
            query += ` AND (
                u.nombre LIKE ? OR 
                u.apellido LIKE ? OR 
                al.matricula LIKE ?
            )`;
            const searchTerm = `%${q}%`;
            params.push(searchTerm, searchTerm, searchTerm);
        }
        
        query += ` ORDER BY u.nombre, u.apellido LIMIT 50`;
        
        const [alumnos] = await db.execute(query, params);
        console.log('👨‍🎓 Alumnos tutorados encontrados:', alumnos.length);
        
        res.json({
            success: true,
            data: alumnos,
            debug: {
                profesor_id,
                grupos_tutor: gruposTutor,
                total_alumnos: alumnos.length
            }
        });
        
    } catch (error) {
        console.error('Error al buscar alumnos tutorados:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});
export default router;