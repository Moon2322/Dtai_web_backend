import express from 'express';
import { db } from '../index.js';
import { verifyToken } from '../middleware/auth.js';

const router = express.Router();

// Usar middleware en todas las rutas
router.use(verifyToken);

// Obtener todas las categorías del foro
router.get('/categorias', async (req, res) => {
    try {
        const [categorias] = await db.execute(`
            SELECT 
                id,
                nombre,
                descripcion,
                color,
                activo
            FROM categorias_foro 
            WHERE activo = 1
            ORDER BY nombre
        `);

        res.json({
            success: true,
            data: categorias
        });

    } catch (error) {
        console.error('Error al obtener categorías del foro:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

// Obtener comentarios de un post específico
router.get('/posts/:postId/comentarios', async (req, res) => {
    try {
        const { postId } = req.params;

        // Incrementar vistas del post
        await db.execute(`
            UPDATE foro_posts 
            SET vistas = vistas + 1 
            WHERE id = ?
        `, [postId]);

        // Obtener comentarios
        const [comentarios] = await db.execute(`
            SELECT 
                fc.id,
                fc.contenido,
                fc.fecha_creacion,
                fc.fecha_actualizacion,
                CONCAT(u.nombre, ' ', u.apellido) as autor_nombre,
                u.rol as autor_rol,
                (SELECT COUNT(*) FROM interacciones_foro if_user 
                 WHERE if_user.comentario_id = fc.id 
                 AND if_user.tipo_interaccion = 'like') as likes
            FROM foro_comentarios fc
            JOIN usuarios u ON fc.usuario_id = u.id
            WHERE fc.post_id = ? AND fc.activo = 1
            ORDER BY fc.fecha_creacion ASC
        `, [postId]);

        res.json({
            success: true,
            data: comentarios
        });

    } catch (error) {
        console.error('Error al obtener comentarios:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

// Obtener detalles de un post específico
router.get('/posts/:postId', async (req, res) => {
    try {
        const { postId } = req.params;

        const [posts] = await db.execute(`
            SELECT 
                p.id,
                p.titulo,
                p.contenido,
                p.es_fijado,
                p.es_cerrado,
                p.vistas,
                p.likes,
                p.fecha_creacion,
                p.fecha_actualizacion,
                CONCAT(u.nombre, ' ', u.apellido) as autor_nombre,
                u.rol as autor_rol,
                cf.id as categoria_id,
                cf.nombre as categoria_nombre,
                cf.color as categoria_color,
                (SELECT COUNT(*) FROM foro_comentarios fc WHERE fc.post_id = p.id AND fc.activo = 1) as comentarios_count
            FROM foro_posts p
            JOIN usuarios u ON p.usuario_id = u.id
            JOIN categorias_foro cf ON p.categoria_id = cf.id
            WHERE p.id = ? AND p.activo = 1
        `, [postId]);

        if (posts.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Post no encontrado'
            });
        }

        res.json({
            success: true,
            data: posts[0]
        });

    } catch (error) {
        console.error('Error al obtener post:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

// Crear nueva categoría (solo para administradores/directivos)
router.post('/categorias', async (req, res) => {
    try {
        // Verificar que sea directivo
        const [directivo] = await db.execute(
            'SELECT id FROM directivos WHERE usuario_id = (SELECT id FROM usuarios WHERE correo = ?)',
            [req.user.correo]
        );
        
        if (directivo.length === 0) {
            return res.status(403).json({
                success: false,
                message: 'Solo los directivos pueden crear categorías'
            });
        }

        const { nombre, descripcion, color } = req.body;

        if (!nombre) {
            return res.status(400).json({
                success: false,
                message: 'El nombre de la categoría es requerido'
            });
        }

        const [resultado] = await db.execute(`
            INSERT INTO categorias_foro (nombre, descripcion, color, creado_por, activo)
            VALUES (?, ?, ?, (SELECT id FROM profesores WHERE usuario_id = (SELECT id FROM usuarios WHERE correo = ?)), 1)
        `, [nombre, descripcion || null, color || '#3498db', req.user.correo]);

        res.json({
            success: true,
            message: 'Categoría creada exitosamente',
            data: { id: resultado.insertId }
        });

    } catch (error) {
        console.error('Error al crear categoría:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

export default router;