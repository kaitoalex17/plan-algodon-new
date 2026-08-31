import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "./prisma";
import bcrypt from "bcryptjs";
import { Adapter } from "next-auth/adapters";

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as Adapter,
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        const cleanEmail = (credentials?.email || "").trim().toLowerCase();
        const cleanPassword = (credentials?.password || "").trim();

        if (!cleanEmail || !cleanPassword) {
          throw new Error("Por favor, introduce tu email y contraseña");
        }

        const user = await prisma.user.findFirst({
          where: { 
            email: {
              equals: cleanEmail,
              mode: "insensitive"
            }
          }
        });

        if (!user || !user.password) {
          throw new Error("Usuario no encontrado");
        }

        const isValid = await bcrypt.compare(cleanPassword, user.password);

        if (!isValid) {
          throw new Error("Contraseña incorrecta");
        }

        // Registrar timestamp de última conexión del usuario
        try {
          await prisma.user.update({
            where: { id: user.id },
            data: { lastLogin: new Date() }
          });
        } catch (e) {
          console.error("Error al actualizar lastLogin:", e);
        }

        return user;
      }
    })
  ],
  session: {
    strategy: "jwt",
    maxAge: 7 * 24 * 60 * 60, // 7 días
 },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as any).role;
        token.color = (user as any).color;
        token.tokenVersion = (user as any).tokenVersion ?? 1;
        return token;
      }

      // Validar si la versión del token coincide con la base de datos
      if (token.id) {
        try {
          const dbUser = await prisma.user.findUnique({
            where: { id: token.id as string },
            select: { tokenVersion: true, role: true, color: true }
          });
          
          if (dbUser) {
            if (dbUser.tokenVersion && token.tokenVersion && dbUser.tokenVersion !== token.tokenVersion) {
              return {}; // Sesión invalidada por admin
            }
            token.role = dbUser.role;
            token.color = dbUser.color;
          }
        } catch (e) {
          // Si hay error transitorio de conexión a la BD, no invalidar el token
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (token && token.id && session.user) {
        (session.user as any).id = token.id;
        (session.user as any).role = token.role;
        (session.user as any).color = token.color;
      } else if (token && token.id && !session.user) {
        session.user = {
          id: token.id as string,
          role: token.role,
          color: token.color,
          name: token.name,
          email: token.email,
        } as any;
      }
      return session;
    }
  },
  pages: {
    signIn: "/login",
  },
  secret: process.env.NEXTAUTH_SECRET,
};
