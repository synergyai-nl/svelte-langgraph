import type { Profile } from '@auth/sveltekit';
import type { OIDCConfig, OIDCUserConfig } from '@auth/sveltekit/providers';

export function GenericOIDCProvider(config: OIDCUserConfig<Profile>): OIDCConfig<Profile> {
	return {
		id: 'oidc',
		name: 'OIDC',
		type: 'oidc',
		checks: ['pkce', 'state'],
		options: config
	};
}
