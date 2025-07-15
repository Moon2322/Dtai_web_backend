import express from 'express';
import { db } from '../index.js';
import { verifyToken, publicRoute } from '../middleware/auth.js';
import upload, { uploadToFirebase, deleteFromFirebase } from '../middleware/upload.js';

const router = express.Router();

router.get('/noticias', async (req, res) => {
    try {
        const { search, categoria, estado } = req.query;
        
        let query = `
            SELECT n.*, 
                   d.id as directivo_id,
                   u.nombre, u.apellido,
                   c.nombre as categoria_nombre, c.color as categoria_color
            FROM noticias n
            JOIN directivos d ON n.autor_id = d.id
            JOIN usuarios u ON d.usuario_id = u.id
            JOIN categorias_noticias c ON n.categoria_id = c.id
            WHERE 1=1
        `;
        
        const params = [];
        
        if (search && search !== '') {
            query += ` AND (n.titulo LIKE ? OR n.contenido LIKE ?)`;
            params.push(`%${search}%`, `%${search}%`);
        }
        
        if (categoria && categoria !== 'todas') {
            query += ` AND c.nombre = ?`;
            params.push(categoria);
        }
        
        if (estado && estado !== 'todos') {
            query += ` AND n.publicada = ?`;
            params.push(estado === 'publicada' ? 1 : 0);
        }
        
        query += ` ORDER BY n.fecha_creacion DESC`;
        
        const [noticias] = await db.execute(query, params);
        
        res.json({
            success: true,
            data: noticias
        });
        
    } catch (error) {
        console.error('Error al obtener noticias:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor',
            error: error.message
        });
    }
});

router.get('/noticias/stats', async (req, res) => {
    try {
        const [noticiasPublicadas] = await db.execute(`
            SELECT COUNT(*) as total FROM noticias WHERE publicada = TRUE
        `);
        
        const [borradores] = await db.execute(`
            SELECT COUNT(*) as total FROM noticias WHERE publicada = FALSE
        `);
        
        const [totalVistas] = await db.execute(`
            SELECT SUM(vistas) as total FROM noticias WHERE publicada = TRUE
        `);
        
        const [categoriasActivas] = await db.execute(`
            SELECT COUNT(*) as total FROM categorias_noticias WHERE activo = TRUE
        `);
        
        res.json({
            success: true,
            data: {
                noticiasPublicadas: noticiasPublicadas[0].total,
                borradores: borradores[0].total,
                totalVistas: totalVistas[0].total || 0,
                categoriasActivas: categoriasActivas[0].total
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

router.get('/categorias-noticias', async (req, res) => {
    try {
        const [categorias] = await db.execute(
            'SELECT * FROM categorias_noticias WHERE activo = TRUE ORDER BY orden, nombre'
        );
        
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

router.post('/noticias', verifyToken, upload.single('imagen'), async (req, res) => {
    try {
        const {
            titulo,
            contenido,
            resumen,
            categoria_id,
            es_destacada,
            publicada
        } = req.body;
        
        if (!titulo || !contenido || !categoria_id) {
            return res.status(400).json({
                success: false,
                message: 'Los campos título, contenido y categoría son requeridos'
            });
        }

        const [directivo] = await db.execute(
            `SELECT d.id, u.nombre, u.apellido 
             FROM directivos d 
             JOIN usuarios u ON d.usuario_id = u.id 
             WHERE u.correo = ? AND u.activo = TRUE`,
            [req.user.correo]
        );
        
        if (directivo.length === 0) {
            const [usuarioData] = await db.execute(
                'SELECT id FROM usuarios WHERE correo = ? AND rol = "directivo"',
                [req.user.correo]
            );
            
            if (usuarioData.length > 0) {
                await db.execute(
                    `INSERT INTO directivos (usuario_id, numero_empleado, cargo, nivel_acceso, fecha_nombramiento)
                     VALUES (?, ?, 'Director', 'director', NOW())`,
                    [usuarioData[0].id, 'DIR' + Date.now()]
                );
                
                const [nuevoDirectivo] = await db.execute(
                    `SELECT d.id FROM directivos d 
                     JOIN usuarios u ON d.usuario_id = u.id 
                     WHERE u.correo = ?`,
                    [req.user.correo]
                );
                
                if (nuevoDirectivo.length === 0) {
                    return res.status(403).json({
                        success: false,
                        message: 'Error al crear perfil de directivo'
                    });
                }
                
                const autorId = nuevoDirectivo[0].id;
                
                let imagen_url = null;
                let imagen_firebase_path = null;
                
                if (req.file) {
                    try {
                        const uploadResult = await uploadToFirebase(req.file, 'noticias');
                        imagen_url = uploadResult.publicUrl;
                        imagen_firebase_path = uploadResult.fileName;
                    } catch (uploadError) {
                        console.error('Error uploading image:', uploadError);
                    }
                }
                
                const [result] = await db.execute(`
                    INSERT INTO noticias (
                        titulo, contenido, resumen, autor_id, categoria_id,
                        es_destacada, publicada, fecha_publicacion, imagen_url, imagen_firebase_path
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    titulo,
                    contenido,
                    resumen || null,
                    autorId,
                    categoria_id,
                    es_destacada || false,
                    publicada || false,
                    publicada ? new Date() : null,
                    imagen_url,
                    imagen_firebase_path
                ]);
                
                return res.json({
                    success: true,
                    message: 'Noticia creada exitosamente',
                    data: { id: result.insertId }
                });
            } else {
                return res.status(403).json({
                    success: false,
                    message: 'Solo los directivos pueden crear noticias. Usuario no encontrado o no es directivo.'
                });
            }
        }
        
        const autorId = directivo[0].id;
        
        let imagen_url = null;
        let imagen_firebase_path = null;
        
        if (req.file) {
            try {
                const uploadResult = await uploadToFirebase(req.file, 'noticias');
                imagen_url = uploadResult.publicUrl;
                imagen_firebase_path = uploadResult.fileName;
            } catch (uploadError) {
                console.error('Error uploading image:', uploadError);
            }
        }
        
        const [result] = await db.execute(`
            INSERT INTO noticias (
                titulo, contenido, resumen, autor_id, categoria_id,
                es_destacada, publicada, fecha_publicacion, imagen_url, imagen_firebase_path
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            titulo,
            contenido,
            resumen || null,
            autorId,
            categoria_id,
            es_destacada || false,
            publicada || false,
            publicada ? new Date() : null,
            imagen_url,
            imagen_firebase_path
        ]);
        
        res.json({
            success: true,
            message: 'Noticia creada exitosamente',
            data: { id: result.insertId }
        });
        
    } catch (error) {
        console.error('Error al crear noticia:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor',
            error: error.message
        });
    }
});

router.put('/noticias/:id', verifyToken, upload.single('imagen'), async (req, res) => {
    try {
        const { id } = req.params;
        const {
            titulo,
            contenido,
            resumen,
            categoria_id,
            es_destacada,
            publicada
        } = req.body;

        const [noticia] = await db.execute(
            'SELECT * FROM noticias WHERE id = ?',
            [id]
        );
        
        if (noticia.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Noticia no encontrada'
            });
        }

        let fechaPublicacion = noticia[0].fecha_publicacion;
        if (publicada && !noticia[0].publicada) {
            fechaPublicacion = new Date();
        } else if (!publicada) {
            fechaPublicacion = null;
        }

        let imagen_url = noticia[0].imagen_url;
        let imagen_firebase_path = noticia[0].imagen_firebase_path;
        
        if (req.file) {
            try {
                if (imagen_firebase_path) {
                    await deleteFromFirebase(imagen_firebase_path);
                }
                
                const uploadResult = await uploadToFirebase(req.file, 'noticias');
                imagen_url = uploadResult.publicUrl;
                imagen_firebase_path = uploadResult.fileName;
            } catch (uploadError) {
                console.error('Error uploading image:', uploadError);
            }
        }
        
        await db.execute(`
            UPDATE noticias SET
                titulo = ?, contenido = ?, resumen = ?, categoria_id = ?,
                es_destacada = ?, publicada = ?, fecha_publicacion = ?,
                imagen_url = ?, imagen_firebase_path = ?
            WHERE id = ?
        `, [
            titulo, contenido, resumen, categoria_id,
            es_destacada, publicada, fechaPublicacion,
            imagen_url, imagen_firebase_path, id
        ]);
        
        res.json({
            success: true,
            message: 'Noticia actualizada exitosamente'
        });
        
    } catch (error) {
        console.error('Error al actualizar noticia:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor',
            error: error.message
        });
    }
});

router.delete('/noticias/:id', verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        await db.execute(
            'UPDATE noticias SET publicada = FALSE, fecha_publicacion = NULL WHERE id = ?', 
            [id]
        );
        
        res.json({
            success: true,
            message: 'Noticia despublicada exitosamente (baja lógica)'
        });
        
    } catch (error) {
        console.error('Error al despublicar noticia:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor',
            error: error.message
        });
    }
});

router.patch('/noticias/:id/publicar', verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { publicada } = req.body;
        
        const fechaPublicacion = publicada ? new Date() : null;
        
        await db.execute(
            'UPDATE noticias SET publicada = ?, fecha_publicacion = ? WHERE id = ?',
            [publicada, fechaPublicacion, id]
        );
        
        res.json({
            success: true,
            message: `Noticia ${publicada ? 'publicada' : 'despublicada'} exitosamente`
        });
        
    } catch (error) {
        console.error('Error al cambiar estado de publicación:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor',
            error: error.message
        });
    }
});

router.get('/noticias/publicas', async (req, res) => {
    try {
        const [noticias] = await db.execute(`
            SELECT 
                n.id,
                n.titulo,
                n.contenido,
                n.resumen,
                n.imagen_url,
                n.es_destacada,
                n.fecha_publicacion,
                n.vistas,
                cn.nombre as categoria_nombre,
                cn.color as categoria_color,
                CONCAT(u.nombre, ' ', u.apellido) as autor_nombre
            FROM noticias n
            INNER JOIN categorias_noticias cn ON n.categoria_id = cn.id
            INNER JOIN directivos d ON n.autor_id = d.id
            INNER JOIN usuarios u ON d.usuario_id = u.id
            WHERE n.publicada = 1 
            AND (n.fecha_expiracion IS NULL OR n.fecha_expiracion > NOW())
            ORDER BY n.es_destacada DESC, n.fecha_publicacion DESC
            LIMIT 20
        `);

        res.json({
            success: true,
            data: noticias
        });
    } catch (error) {
        console.error('Error al obtener noticias públicas:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

router.get('/noticias/publicas/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        const [noticias] = await db.execute(`
            SELECT 
                n.id,
                n.titulo,
                n.contenido,
                n.resumen,
                n.imagen_url,
                n.es_destacada,
                n.fecha_publicacion,
                n.vistas,
                cn.nombre as categoria_nombre,
                cn.color as categoria_color,
                CONCAT(u.nombre, ' ', u.apellido) as autor_nombre
            FROM noticias n
            INNER JOIN categorias_noticias cn ON n.categoria_id = cn.id
            INNER JOIN directivos d ON n.autor_id = d.id
            INNER JOIN usuarios u ON d.usuario_id = u.id
            WHERE n.id = ? 
            AND n.publicada = 1 
            AND (n.fecha_expiracion IS NULL OR n.fecha_expiracion > NOW())
        `, [id]);

        if (noticias.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Noticia no encontrada'
            });
        }

        res.json({
            success: true,
            data: noticias[0]
        });
    } catch (error) {
        console.error('Error al obtener noticia pública:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

router.post('/noticias/publicas/:id/vista', async (req, res) => {
    try {
        const { id } = req.params;
        
        const [noticia] = await db.execute(`
            SELECT id FROM noticias 
            WHERE id = ? AND publicada = 1
        `, [id]);

        if (noticia.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Noticia no encontrada'
            });
        }

        await db.execute(`
            UPDATE noticias 
            SET vistas = vistas + 1 
            WHERE id = ?
        `, [id]);

        res.json({
            success: true,
            message: 'Vista registrada'
        });
    } catch (error) {
        console.error('Error al registrar vista:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

router.get('/stats/publicas', async (req, res) => {
    try {
        const [stats] = await db.execute(`
            SELECT 
                (SELECT COUNT(*) FROM alumnos a 
                 INNER JOIN usuarios u ON a.usuario_id = u.id 
                 WHERE u.activo = 1 AND a.estado_alumno = 'activo') as estudiantes,
                (SELECT COUNT(*) FROM profesores p 
                 INNER JOIN usuarios u ON p.usuario_id = u.id 
                 WHERE u.activo = 1 AND p.activo = 1) as profesores
        `);

        res.json({
            success: true,
            data: stats[0]
        });
    } catch (error) {
        console.error('Error al obtener estadísticas públicas:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

export default router;