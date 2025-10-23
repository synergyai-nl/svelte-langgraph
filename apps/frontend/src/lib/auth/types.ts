import type { Profile } from '@auth/core/types';
import type { OIDCUserConfig } from '@auth/sveltekit/providers';

export interface GenericOIDCUserConfig extends OIDCUserConfig<Profile> {
	clientId: string;
	clientSecret: string;
	issuer: string;
}
