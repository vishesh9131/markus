import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";

const hasGoogle = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);

const providers = [];

if (hasGoogle) {
  providers.push(
    Google({
      authorization: {
        params: {
          // openid/email/profile + permission to manage files this app creates
          scope:
            "openid email profile https://www.googleapis.com/auth/drive.file",
          access_type: "offline",
          prompt: "consent",
        },
      },
    })
  );
} else {
  // Demo fallback so the app runs before real Google keys are added.
  // Workspaces persist to local disk instead of Drive in this mode.
  providers.push(
    Credentials({
      id: "demo",
      name: "Demo",
      credentials: {},
      authorize: async () => ({
        id: "demo-user",
        name: "Demo User",
        email: "demo@markus.local",
        image: null,
      }),
    })
  );
}

export const AUTH_MODE = hasGoogle ? "google" : "demo";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers,
  session: { strategy: "jwt" },
  trustHost: true,
  callbacks: {
    async jwt({ token, account }) {
      if (account?.provider === "google") {
        token.googleAccessToken = account.access_token;
        token.googleRefreshToken = account.refresh_token ?? token.googleRefreshToken;
        token.googleExpiresAt = account.expires_at;
      }
      return token;
    },
    async session({ session, token }) {
      session.googleAccessToken = token.googleAccessToken || null;
      session.isDemo = !token.googleAccessToken;
      return session;
    },
    authorized({ auth: session, request: { nextUrl } }) {
      const guarded =
        nextUrl.pathname.startsWith("/studio") ||
        nextUrl.pathname.startsWith("/api/workspaces") ||
        nextUrl.pathname.startsWith("/api/billing");
      if (guarded) return Boolean(session?.user);
      return true;
    },
  },
  pages: { signIn: "/" },
});
