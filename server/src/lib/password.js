import bcrypt from 'bcryptjs';
import { config } from '../config.js';

export const hashPassword = (plain) => bcrypt.hash(plain, config.auth.bcryptRounds);

export const verifyPassword = (plain, hash) => bcrypt.compare(plain, hash);
