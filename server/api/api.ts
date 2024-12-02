import { Request, Response, Express } from 'express';
import { ResultSetHeader } from 'mysql2/promise';
import { RowDataPacket } from 'mysql2';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import authenticateToken from '../auth-Middleware/auth'; // Auth Middleware importieren
import { Database } from '../database/database';
import { AuthenticatedRequest } from '../types/express'; // Pfad anpassen

export class API {
  app: Express;
  db: Database;

  constructor(app: Express, db: Database) {
    this.app = app;
    this.db = db;

    // Unprotected Routes
    this.app.post('/register', this.registerUser.bind(this));
    this.app.post('/login', this.loginUser.bind(this));

    // Protected Routes
    this.app.get('/posts', authenticateToken, this.getPosts.bind(this));
    this.app.post('/posts', authenticateToken, this.createPost.bind(this));
    this.app.put('/posts/:id', authenticateToken, this.updatePost.bind(this));
    this.app.delete('/posts/:id', authenticateToken, this.deletePost.bind(this));

    // Comment Routes
    this.app.post('/posts/:postId/comments', authenticateToken, this.createComment.bind(this));
    this.app.get('/posts/:postId/comments', authenticateToken, this.getComments.bind(this));
    this.app.put('/posts/:postId/comments/:id', authenticateToken, this.updateComment.bind(this));
    this.app.delete('/posts/:postId/comments/:id', authenticateToken, this.deleteComment.bind(this));
  }

  // --- Utility Functions ---
  private validateId(id: string | number | undefined): boolean {
    const numId = Number(id); // Konvertiere in eine Zahl
    return !isNaN(numId) && numId > 0;
  }  

  // --- Post Functions ---
  private async getPosts(req: AuthenticatedRequest, res: Response) {
    try {
      const query = `SELECT tweets.id, tweets.content, tweets.created_at, users.username 
                     FROM tweets 
                     INNER JOIN users ON tweets.user_id = users.id 
                     ORDER BY tweets.created_at DESC`;
      const posts = await this.db.executeSQL<RowDataPacket[]>(query);
      res.json(posts);
    } catch (error) {
      console.error('Error fetching posts:', error);
      res.status(500).json({ message: 'Error fetching posts' });
    }
  }

  private async createPost(req: AuthenticatedRequest, res: Response) {
    const { content } = req.body;

    if (!content || typeof content !== 'string') {
      return res.status(400).json({ message: 'Invalid content' });
    }

    try {
      const query = `INSERT INTO tweets (user_id, content, created_at) VALUES (?, ?, NOW())`;
      const result = await this.db.executeSQL<ResultSetHeader>(query, [req.user?.id, content]);
      res.status(201).json({ message: 'Post created', postId: (result as ResultSetHeader).insertId });
    } catch (error) {
      console.error('Error creating post:', error);
      res.status(500).json({ message: 'Error creating post' });
    }
  }

  private async updatePost(req: AuthenticatedRequest, res: Response) {
    const { id } = req.params;
    const { content } = req.body;

    if (!this.validateId(id)) {
      return res.status(400).json({ message: 'Invalid ID' });
    }

    if (!content || typeof content !== 'string') {
      return res.status(400).json({ message: 'Invalid content' });
    }

    try {
      const query = `UPDATE tweets SET content = ? WHERE id = ? AND user_id = ?`;
      const result = await this.db.executeSQL<ResultSetHeader>(query, [content, id, req.user?.id]);
      if (result.affectedRows === 0) {
        return res.status(404).json({ message: 'Post not found or unauthorized' });
      }
      res.json({ message: 'Post updated' });
    } catch (error) {
      console.error('Error updating post:', error);
      res.status(500).json({ message: 'Error updating post' });
    }
  }

  private async deletePost(req: AuthenticatedRequest, res: Response) {
    const { id } = req.params;

    if (!this.validateId(id)) {
      return res.status(400).json({ message: 'Invalid ID' });
    }

    try {
      const query = `DELETE FROM tweets WHERE id = ? AND user_id = ?`;
      const result = await this.db.executeSQL<ResultSetHeader>(query, [id, req.user?.id]);
      if (result.affectedRows === 0) {
        return res.status(404).json({ message: 'Post not found or unauthorized' });
      }
      res.json({ message: 'Post deleted' });
    } catch (error) {
      console.error('Error deleting post:', error);
      res.status(500).json({ message: 'Error deleting post' });
    }
  }

  // --- Comment Functions ---
  private async createComment(req: AuthenticatedRequest, res: Response) {
    const postId = Number(req.params.postId); // Konvertiere postId zu einer Zahl
    const { content } = req.body;

    if (!this.validateId(postId)) { // Überprüfe, ob postId gültig ist
      return res.status(400).json({ message: 'Invalid post ID' });
    }

    if (!content || typeof content !== 'string') {
      return res.status(400).json({ message: 'Invalid content' });
    }

    try {
      const query = `
        INSERT INTO comments (tweet_id, user_id, content, created_at)
        VALUES (?, ?, ?, NOW())
      `;
      const result = await this.db.executeSQL<ResultSetHeader>(query, [postId, req.user?.id, content]);
      res.status(201).json({ message: 'Comment created', commentId: result.insertId });
    } catch (error) {
      console.error('Error creating comment:', error);
      res.status(500).json({ message: 'Error creating comment' });
    }
  }
  

  private async getComments(req: AuthenticatedRequest, res: Response) {
    const { postId } = req.params;

    if (!this.validateId(postId)) {
      return res.status(400).json({ message: 'Invalid post ID' });
    }

    try {
      const query = `
        SELECT c.id, c.content, c.created_at, u.username
        FROM comments c
        INNER JOIN users u ON c.user_id = u.id
        WHERE c.tweet_id = ?
        ORDER BY c.created_at ASC
      `;
      const rows = await this.db.executeSQL<RowDataPacket[]>(query, [postId]);
      res.json(rows);
    } catch (error) {
      console.error('Error fetching comments:', error);
      res.status(500).json({ message: 'Error fetching comments' });
    }
  }

  private async updateComment(req: AuthenticatedRequest, res: Response) {
    const { id } = req.params;
    const { content } = req.body;

    if (!this.validateId(id)) {
      return res.status(400).json({ message: 'Invalid comment ID' });
    }

    if (!content || typeof content !== 'string') {
      return res.status(400).json({ message: 'Invalid content' });
    }

    try {
      const query = `UPDATE comments SET content = ? WHERE id = ? AND user_id = ?`;
      const result = await this.db.executeSQL<ResultSetHeader>(query, [content, id, req.user?.id]);
      if (result.affectedRows === 0) {
        return res.status(404).json({ message: 'Comment not found or unauthorized' });
      }
      res.json({ message: 'Comment updated' });
    } catch (error) {
      console.error('Error updating comment:', error);
      res.status(500).json({ message: 'Error updating comment' });
    }
  }

  private async deleteComment(req: AuthenticatedRequest, res: Response) {
    const { id } = req.params;

    if (!this.validateId(id)) {
      return res.status(400).json({ message: 'Invalid comment ID' });
    }

    try {
      const query = `DELETE FROM comments WHERE id = ? AND user_id = ?`;
      const result = await this.db.executeSQL<ResultSetHeader>(query, [id, req.user?.id]);
      if (result.affectedRows === 0) {
        return res.status(404).json({ message: 'Comment not found or unauthorized' });
      }
      res.json({ message: 'Comment deleted' });
    } catch (error) {
      console.error('Error deleting comment:', error);
      res.status(500).json({ message: 'Error deleting comment' });
    }
  }

  // --- Authentication ---
  private async registerUser(req: Request, res: Response) {
    const { username, password } = req.body;
    if (!username || typeof username !== 'string' || !password || typeof password !== 'string') {
      return res.status(400).send('Invalid username or password');
    }

    try {
      const hashedPassword = await bcrypt.hash(password, 10);
      const query = `INSERT INTO users (username, password) VALUES (?, ?)`;
      await this.db.executeSQL(query, [username, hashedPassword]);
      res.status(201).send('User registered');
    } catch (error) {
      console.error('Error registering user:', error);
      res.status(500).send('Error registering user');
    }
  }

  private async loginUser(req: Request, res: Response) {
    const { username, password } = req.body;

    if (!username || typeof username !== 'string' || !password || typeof password !== 'string') {
      return res.status(400).send('Invalid username or password');
    }

    try {
      const query = `SELECT * FROM users WHERE username = ?`;
      const users: any = await this.db.executeSQL(query, [username]);

      if (users.length === 0) {
        return res.status(404).send('User not found');
      }

      const user = users[0];
      const isValidPassword = await bcrypt.compare(password, user.password);

      if (!isValidPassword) {
        return res.status(401).send('Invalid credentials');
      }

      const token = jwt.sign(
        { id: user.id, username: user.username },
        process.env.JWT_SECRET || 'supersecretkey',
        { expiresIn: '1h' }
      );

      res.json({ token });
    } catch (error) {
      console.error('Error logging in:', error);
      res.status(500).send('Error logging in');
    }
  }
}