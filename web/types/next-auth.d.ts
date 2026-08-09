import 'next-auth';
import 'next-auth/jwt';

/**
 * Module augmentation for the fields our callbacks add.
 *
 * Without this, `session.user.isAdmin` and `token.isAdmin` are type errors even though the
 * callbacks in lib/authOptions.ts set them.
 */

declare module 'next-auth' {
  interface Session {
    user?: {
      name?: string | null;
      email?: string | null;
      image?: string | null;
      /** True when this address is a row in the `Admin` table, re-checked per refresh. */
      isAdmin?: boolean;
    };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    isAdmin?: boolean;
  }
}
