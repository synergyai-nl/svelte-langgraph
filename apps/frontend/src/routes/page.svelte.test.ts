import { describe, test, expect, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/svelte';
import Page from './+page.svelte';

const GITHUB_URL = 'https://github.com/synergyai-nl/svelte-langgraph';

beforeEach(() => {
	render(Page);
});

describe('landing page', () => {
	describe('hero', () => {
		// The closing CTA section repeats these calls to action, so scope to the hero.
		const hero = () => within(screen.getByRole('heading', { level: 1 }).closest('section')!);

		test('renders the headline', () => {
			expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Your agent works.');
		});

		test('makes the demos overview the primary call to action', () => {
			const demo = hero().getByRole('link', { name: /explore demos/i });

			expect(demo).toHaveAttribute('href', '/demo');
			expect(demo).not.toHaveAttribute('target');
		});

		test('links to the GitHub repository', () => {
			expect(hero().getByRole('link', { name: /view on github/i })).toHaveAttribute(
				'href',
				GITHUB_URL
			);
		});

		test('renders the terminal and stack logos', () => {
			expect(screen.getByTestId('hero-terminal-body')).toBeInTheDocument();
			expect(screen.getByAltText('Svelte')).toBeInTheDocument();
			expect(screen.getByAltText('LangGraph')).toBeInTheDocument();
		});
	});

	describe('final call to action', () => {
		test('links internally to the demos overview', () => {
			const heading = screen.getByRole('heading', {
				level: 2,
				name: /your agent is the product/i
			});
			const section = within(heading.closest('section')!);
			const demo = section.getByRole('link', { name: /explore demos/i });

			expect(demo).toHaveAttribute('href', '/demo');
			expect(demo).not.toHaveAttribute('target');
		});

		test('does not link to the old deployed-root demo URL', () => {
			const demoLinks = screen.getAllByRole('link', { name: /explore demos/i });

			expect(demoLinks).toHaveLength(2);
			demoLinks.forEach((link) => {
				expect(link).toHaveAttribute('href', '/demo');
				expect(link).not.toHaveAttribute('target');
			});
			expect(
				screen.queryByRole('link', { name: /open the chat|try live demo/i })
			).not.toBeInTheDocument();
			expect(
				document.querySelector('a[href="https://svelte-langgraph-demo.synergyai.nl/"]')
			).toBeNull();
		});
	});

	describe('features', () => {
		test.each([
			'Connect Python agents directly',
			'Pass security review. Stay maintainable.',
			'Customize every layer — no lock-in',
			'Swap models without rewriting'
		])('renders the "%s" card', (title) => {
			expect(screen.getByText(title)).toBeInTheDocument();
		});
	});

	describe('getting started', () => {
		test.each(['Install toolchain', 'Configure & run', 'Deploy to your stack'])(
			'renders the "%s" step',
			(title) => {
				expect(screen.getByText(title)).toBeInTheDocument();
			}
		);
	});

	describe('personas', () => {
		test.each([
			'Python AI developers',
			'Boutique AI agencies',
			'SaaS platform teams',
			'CX & support teams'
		])('renders the "%s" card', (title) => {
			expect(screen.getByText(title)).toBeInTheDocument();
		});
	});

	describe('landscape comparison', () => {
		test('renders the comparison table', () => {
			expect(screen.getByRole('region', { name: 'Tool comparison' })).toBeInTheDocument();
		});

		test('compares against each named alternative', () => {
			const table = screen.getByRole('region', { name: 'Tool comparison' });

			['svelte-langgraph', 'Langflow', 'Chainlit', 'Open WebUI', 'Custom React'].forEach((tool) => {
				expect(
					within(table).getByRole('columnheader', { name: new RegExp(tool, 'i') })
				).toBeInTheDocument();
			});
		});

		test('renders a row per compared capability', () => {
			const table = screen.getByRole('region', { name: 'Tool comparison' });

			expect(
				within(table).getByRole('rowheader', { name: 'Security review friendly' })
			).toBeInTheDocument();
			expect(
				within(table).getByRole('rowheader', { name: 'Security-first (OIDC built in)' })
			).toBeInTheDocument();
		});

		test('credits the ecosystem alternatives with outbound links', () => {
			// Some names appear twice — as a table column and again as an ecosystem link.
			const hrefs = screen.getAllByRole('link').map((link) => link.getAttribute('href'));

			expect(hrefs).toEqual(
				expect.arrayContaining([
					'https://chainlit.io',
					'https://www.langflow.org',
					'https://streamlit.io',
					'https://openwebui.com'
				])
			);
		});
	});

	describe('roadmap', () => {
		test('marks shipped work', () => {
			expect(screen.getByText('Core chat UI with streaming')).toBeInTheDocument();
			expect(screen.getAllByText('Shipped').length).toBeGreaterThan(0);
		});

		test('marks work in progress', () => {
			expect(screen.getAllByText('In progress').length).toBeGreaterThan(0);
		});

		test('gates the in-progress pulse behind motion-safe', () => {
			// Decorative only, unlike the loading pulses elsewhere in the app, so it must
			// respect prefers-reduced-motion. The custom marketing animations are handled
			// by a media query in app.tailwind.css; Tailwind built-ins are not.
			// `getAttribute` rather than `.className`: these are SVG elements, whose
			// className is an SVGAnimatedString.
			const pulsing = [...document.querySelectorAll('[class*="animate-pulse"]')];

			expect(pulsing.length).toBeGreaterThan(0);
			pulsing.forEach((el) =>
				expect(el.getAttribute('class')).toContain('motion-safe:animate-pulse')
			);
		});

		test('marks planned work', () => {
			expect(screen.getByText('Conversation history')).toBeInTheDocument();
			expect(screen.getAllByText('Planned').length).toBeGreaterThan(0);
		});
	});

	describe('footer', () => {
		test('states the licence', () => {
			expect(screen.getByText(/MIT License/)).toBeInTheDocument();
		});

		test('links to the repository', () => {
			const githubLinks = screen
				.getAllByRole('link')
				.filter((link) => link.getAttribute('href')?.startsWith(GITHUB_URL));

			expect(githubLinks.length).toBeGreaterThan(0);
		});
	});

	describe('section structure', () => {
		test('renders every top-level section heading', () => {
			const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);

			expect(headings).toEqual(
				expect.arrayContaining([
					expect.stringContaining('Clone it. Run it. Ship it.'),
					expect.stringContaining('Built for builders.'),
					expect.stringContaining("Know what you're choosing."),
					expect.stringContaining("Where we are. Where we're going."),
					expect.stringContaining('Help shape what ships next.')
				])
			);
		});

		test('has exactly one level-one heading', () => {
			expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
		});
	});
});
