import express from 'express';
import { db } from '../index.js';
import { validarProfesor } from '../middleware/auth.js';

const router = express.Router();

// Aplicar middleware de validación de profesor a todas las rutas
router.use(validarProfesor);

// Obtener todas las categorías del foro
router.get('/categorias', async (req, res) => {
    try {
        const [categorias] = await db.execute(`
            SELECT id, nombre, descripcion, color, activo
            FROM categorias_foro 
            WHERE activo = 1
            ORDER BY nombre ASC
        `);

        res.json({
            success: true,
            data: categorias
        });

    } catch (error) {
        console.error('Error al obtener categorías:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

// Obtener posts del foro con filtros para profesores
router.get('/posts', async (req, res) => {
    try {
        const { categoria, busqueda, pagina = 1, limite = 10 } = req.query;
        const offset = (pagina - 1) * limite;

        let whereClause = 'WHERE p.activo = 1';
        let params = [];

        if (categoria) {
            whereClause += ' AND cf.id = ?';
            params.push(categoria);
        }

        if (busqueda) {
            whereClause += ' AND (p.titulo LIKE ? OR p.contenido LIKE ?)';
            const busquedaParam = `%${busqueda}%`;
            params.push(busquedaParam, busquedaParam);
        }

        // Agregar parámetros de paginación
        params.push(parseInt(limite), offset);

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
            ${whereClause}
            ORDER BY p.es_fijado DESC, p.fecha_actualizacion DESC
            LIMIT ? OFFSET ?
        `, params);

        // Obtener total de posts para paginación
        const countParams = params.slice(0, -2); // Remover límite y offset
        const [totalCount] = await db.execute(`
            SELECT COUNT(*) as total
            FROM foro_posts p
            JOIN usuarios u ON p.usuario_id = u.id
            JOIN categorias_foro cf ON p.categoria_id = cf.id
            ${whereClause}
        `, countParams);

        res.json({
            success: true,
            data: posts,
            pagination: {
                paginaActual: parseInt(pagina),
                totalPaginas: Math.ceil(totalCount[0].total / limite),
                totalElementos: totalCount[0].total,
                elementosPorPagina: parseInt(limite)
            }
        });

    } catch (error) {
        console.error('Error al obtener posts:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

// Crear nuevo post en el foro
router.post('/posts', async (req, res) => {
    try {
        const { titulo, contenido, categoria_id, es_fijado = false } = req.body;

        // Validar datos requeridos
        if (!titulo || !contenido || !categoria_id) {
            return res.status(400).json({
                success: false,
                message: 'Título, contenido y categoría son requeridos'
            });
        }

        // Verificar que la categoría existe
        const [categoria] = await db.execute(
            'SELECT id FROM categorias_foro WHERE id = ? AND activo = 1',
            [categoria_id]
        );

        if (categoria.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Categoría no encontrada'
            });
        }

        // Obtener el ID del usuario profesor
        const [usuario] = await db.execute(
            'SELECT u.id FROM usuarios u JOIN profesores p ON u.id = p.usuario_id WHERE u.correo = ?',
            [req.user.correo]
        );

        if (usuario.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Usuario no encontrado'
            });
        }

        // Crear el post
        const [resultado] = await db.execute(`
            INSERT INTO foro_posts (
                titulo, contenido, categoria_id, usuario_id, es_fijado, activo
            ) VALUES (?, ?, ?, ?, ?, 1)
        `, [titulo, contenido, categoria_id, usuario[0].id, es_fijado]);

        res.status(201).json({
            success: true,
            message: 'Post creado exitosamente',
            data: { id: resultado.insertId }
        });

    } catch (error) {
        console.error('Error al crear post:', error);
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

        // Incrementar vistas del post
        await db.execute(
            'UPDATE foro_posts SET vistas = vistas + 1 WHERE id = ?',
            [postId]
        );

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

// Actualizar un post (solo el autor puede editarlo)
router.put('/posts/:postId', async (req, res) => {
    try {
        const { postId } = req.params;
        const { titulo, contenido, categoria_id, es_fijado } = req.body;

        // Obtener el ID del usuario profesor
        const [usuario] = await db.execute(
            'SELECT u.id FROM usuarios u JOIN profesores p ON u.id = p.usuario_id WHERE u.correo = ?',
            [req.user.correo]
        );

        if (usuario.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Usuario no encontrado'
            });
        }

        // Verificar que el post existe y pertenece al usuario
        const [post] = await db.execute(
            'SELECT id FROM foro_posts WHERE id = ? AND usuario_id = ? AND activo = 1',
            [postId, usuario[0].id]
        );

        if (post.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Post no encontrado o no tienes permisos para editarlo'
            });
        }

        // Actualizar el post
        await db.execute(`
            UPDATE foro_posts 
            SET titulo = ?, contenido = ?, categoria_id = ?, es_fijado = ?, fecha_actualizacion = NOW()
            WHERE id = ?
        `, [titulo, contenido, categoria_id, es_fijado || false, postId]);

        res.json({
            success: true,
            message: 'Post actualizado exitosamente'
        });

    } catch (error) {
        console.error('Error al actualizar post:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

// Eliminar un post (marcar como inactivo)
router.delete('/posts/:postId', async (req, res) => {
    try {
        const { postId } = req.params;

        // Obtener el ID del usuario profesor
        const [usuario] = await db.execute(
            'SELECT u.id FROM usuarios u JOIN profesores p ON u.id = p.usuario_id WHERE u.correo = ?',
            [req.user.correo]
        );

        if (usuario.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Usuario no encontrado'
            });
        }

        // Verificar que el post existe y pertenece al usuario
        const [post] = await db.execute(
            'SELECT id FROM foro_posts WHERE id = ? AND usuario_id = ? AND activo = 1',
            [postId, usuario[0].id]
        );

        if (post.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Post no encontrado o no tienes permisos para eliminarlo'
            });
        }

        // Marcar post como inactivo
        await db.execute(
            'UPDATE foro_posts SET activo = 0 WHERE id = ?',
            [postId]
        );

        res.json({
            success: true,
            message: 'Post eliminado exitosamente'
        });

    } catch (error) {
        console.error('Error al eliminar post:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

// Obtener comentarios de un post
router.get('/posts/:postId/comentarios', async (req, res) => {
    try {
        const { postId } = req.params;

        const [comentarios] = await db.execute(`
            SELECT 
                fc.id,
                fc.contenido,
                fc.fecha_creacion,
                fc.fecha_actualizacion,
                CONCAT(u.nombre, ' ', u.apellido) as autor_nombre,
                u.rol as autor_rol
            FROM foro_comentarios fc
            JOIN usuarios u ON fc.usuario_id = u.id
            WHERE fc.post_id = ?
            AND fc.activo = 1
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

// Crear comentario en un post
router.post('/posts/:postId/comentarios', async (req, res) => {
    try {
        const { postId } = req.params;
        const { contenido } = req.body;

        if (!contenido) {
            return res.status(400).json({
                success: false,
                message: 'El contenido del comentario es requerido'
            });
        }

        // Verificar que el post existe y no está cerrado
        const [post] = await db.execute(
            'SELECT id, es_cerrado FROM foro_posts WHERE id = ? AND activo = 1',
            [postId]
        );

        if (post.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Post no encontrado'
            });
        }

        if (post[0].es_cerrado) {
            return res.status(403).json({
                success: false,
                message: 'Este post está cerrado para comentarios'
            });
        }

        // Obtener el ID del usuario profesor
        const [usuario] = await db.execute(
            'SELECT u.id FROM usuarios u JOIN profesores p ON u.id = p.usuario_id WHERE u.correo = ?',
            [req.user.correo]
        );

        if (usuario.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Usuario no encontrado'
            });
        }

        // Crear el comentario
        const [resultado] = await db.execute(`
            INSERT INTO foro_comentarios (post_id, usuario_id, comentario, activo)
            VALUES (?, ?, ?, 1)
        `, [postId, usuario[0].id, contenido]);

        res.status(201).json({
            success: true,
            message: 'Comentario creado exitosamente',
            data: { id: resultado.insertId }
        });

    } catch (error) {
        console.error('Error al crear comentario:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

// Dar like a un post
router.post('/posts/:postId/like', async (req, res) => {
    try {
        const { postId } = req.params;

        // Obtener el ID del usuario profesor
        const [usuario] = await db.execute(
            'SELECT u.id FROM usuarios u JOIN profesores p ON u.id = p.usuario_id WHERE u.correo = ?',
            [req.user.correo]
        );

        if (usuario.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Usuario no encontrado'
            });
        }

        // Verificar si ya dio like
        const [existeLike] = await db.execute(
            'SELECT id FROM interacciones_foro WHERE usuario_id = ? AND post_id = ? AND tipo_interaccion = "like"',
            [usuario[0].id, postId]
        );

        if (existeLike.length > 0) {
            // Quitar like
            await db.execute(
                'DELETE FROM interacciones_foro WHERE usuario_id = ? AND post_id = ? AND tipo_interaccion = "like"',
                [usuario[0].id, postId]
            );
            
            // Decrementar contador de likes
            await db.execute(
                'UPDATE foro_posts SET likes = likes - 1 WHERE id = ?',
                [postId]
            );

            res.json({
                success: true,
                message: 'Like removido',
                liked: false
            });
        } else {
            // Dar like
            await db.execute(
                'INSERT INTO interacciones_foro (usuario_id, post_id, tipo_interaccion) VALUES (?, ?, "like")',
                [usuario[0].id, postId]
            );
            
            // Incrementar contador de likes
            await db.execute(
                'UPDATE foro_posts SET likes = likes + 1 WHERE id = ?',
                [postId]
            );

            res.json({
                success: true,
                message: 'Like agregado',
                liked: true
            });
        }

    } catch (error) {
        console.error('Error al procesar like:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

// Cerrar/abrir post (solo para el autor)
router.patch('/posts/:postId/toggle-cerrado', async (req, res) => {
    try {
        const { postId } = req.params;

        // Obtener el ID del usuario profesor
        const [usuario] = await db.execute(
            'SELECT u.id FROM usuarios u JOIN profesores p ON u.id = p.usuario_id WHERE u.correo = ?',
            [req.user.correo]
        );

        if (usuario.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Usuario no encontrado'
            });
        }

        // Verificar que el post existe y pertenece al usuario
        const [post] = await db.execute(
            'SELECT id, es_cerrado FROM foro_posts WHERE id = ? AND usuario_id = ? AND activo = 1',
            [postId, usuario[0].id]
        );

        if (post.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Post no encontrado o no tienes permisos'
            });
        }

        const nuevoCerrado = !post[0].es_cerrado;

        // Actualizar estado cerrado
        await db.execute(
            'UPDATE foro_posts SET es_cerrado = ? WHERE id = ?',
            [nuevoCerrado, postId]
        );

        res.json({
            success: true,
            message: `Post ${nuevoCerrado ? 'cerrado' : 'abierto'} exitosamente`,
            es_cerrado: nuevoCerrado
        });

    } catch (error) {
        console.error('Error al cambiar estado del post:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

export default router;