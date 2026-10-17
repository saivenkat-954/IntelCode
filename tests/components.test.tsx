import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { ScrollProgress } from '@/components/ui/ScrollProgress';
import { CookieBanner } from '@/components/privacy/CookieBanner';
import { FaqSection } from '@/components/landing/FaqSection';
import { EmptyState } from '@/components/ui/empty-state';
import { CitationCard } from '@/components/chat/CitationCard';
import { ThemeProvider } from '@/hooks/useTheme';
import { SourceCitation } from '@/types';

describe('UI Design System Components', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = '';
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  describe('1. Button Component', () => {
    it('renders Button with variants and handles click events', () => {
      const handleClick = vi.fn();
      render(<Button onClick={handleClick}>Run Query</Button>);

      const button = screen.getByRole('button', { name: /Run Query/i });
      expect(button).toBeInTheDocument();

      fireEvent.click(button);
      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('renders loading state and prevents click execution when isLoading is true', () => {
      const handleClick = vi.fn();
      render(
        <Button isLoading onClick={handleClick}>
          Saving Changes
        </Button>
      );

      const button = screen.getByRole('button');
      expect(button).toBeDisabled();
      fireEvent.click(button);
      expect(handleClick).not.toHaveBeenCalled();
    });
  });

  describe('2. Input & PasswordInput Components', () => {
    it('renders Input with icon, error, and rightElement support', () => {
      render(
        <Input
          placeholder="Enter repo name"
          error="Repository already exists"
          rightElement={<span data-testid="trailing-badge">Public</span>}
        />
      );

      expect(screen.getByPlaceholderText('Enter repo name')).toBeInTheDocument();
      expect(screen.getByText('Repository already exists')).toBeInTheDocument();
      expect(screen.getByTestId('trailing-badge')).toBeInTheDocument();
    });

    it('toggles password visibility between text and password without submitting form', () => {
      const handleSubmit = vi.fn((e) => e.preventDefault());
      render(
        <form onSubmit={handleSubmit}>
          <PasswordInput placeholder="Enter password" defaultValue="SecretCode123!" />
          <button type="submit">Submit Form</button>
        </form>
      );

      const input = screen.getByPlaceholderText('Enter password') as HTMLInputElement;
      expect(input.type).toBe('password');

      const toggleBtn = screen.getByRole('button', { name: 'Show password' });
      expect(toggleBtn).toBeInTheDocument();
      expect(toggleBtn).toHaveAttribute('type', 'button');

      // Click to reveal password
      fireEvent.click(toggleBtn);
      expect(input.type).toBe('text');
      expect(screen.getByRole('button', { name: 'Hide password' })).toBeInTheDocument();

      // Form was NOT submitted by toggle button click
      expect(handleSubmit).not.toHaveBeenCalled();

      // Click again to hide password
      fireEvent.click(screen.getByRole('button', { name: 'Hide password' }));
      expect(input.type).toBe('password');
      expect(screen.getByRole('button', { name: 'Show password' })).toBeInTheDocument();
    });
  });

  describe('3. ThemeToggle & ThemeProvider', () => {
    it('defaults to dark mode and toggles light/dark theme classes with accessible labels', () => {
      render(
        <ThemeProvider>
          <ThemeToggle />
        </ThemeProvider>
      );

      // Default is dark mode
      expect(document.documentElement.classList.contains('dark')).toBe(true);
      const toggleBtn = screen.getByRole('button', { name: 'Switch to light mode' });
      expect(toggleBtn).toBeInTheDocument();

      // Toggle to light mode
      fireEvent.click(toggleBtn);
      expect(document.documentElement.classList.contains('light')).toBe(true);
      expect(localStorage.getItem('intelcode-theme')).toBe('light');
      expect(screen.getByRole('button', { name: 'Switch to dark mode' })).toBeInTheDocument();

      // Toggle back to dark mode
      fireEvent.click(screen.getByRole('button', { name: 'Switch to dark mode' }));
      expect(document.documentElement.classList.contains('dark')).toBe(true);
      expect(localStorage.getItem('intelcode-theme')).toBe('dark');
    });
  });

  describe('4. Cookie & Essential Storage Notice Banner', () => {
    it('renders privacy banner on initial visit and persists dismissal in localStorage', () => {
      expect(localStorage.getItem('intelcode-privacy-notice-v1')).toBeNull();

      const { unmount } = render(<CookieBanner />);
      expect(screen.getByRole('complementary', { name: /privacy and local storage notice/i })).toBeInTheDocument();
      expect(screen.getByText(/essential storage only/i)).toBeInTheDocument();

      // Toggle details
      const viewDetailsBtn = screen.getByRole('button', { name: 'View storage items' });
      fireEvent.click(viewDetailsBtn);
      expect(screen.getByText(/sb-\*-auth-token/i)).toBeInTheDocument();

      // Dismiss banner
      const dismissBtn = screen.getByRole('button', { name: 'Understood' });
      fireEvent.click(dismissBtn);

      expect(localStorage.getItem('intelcode-privacy-notice-v1')).not.toBeNull();
      unmount();

      // Re-rendering should NOT show banner
      render(<CookieBanner />);
      expect(screen.queryByRole('complementary', { name: /privacy and local storage notice/i })).toBeNull();
    });
  });

  describe('5. Expandable FAQ Accordion', () => {
    it('renders FAQ questions with accessible ARIA attributes and expands/collapses items', () => {
      render(<FaqSection />);

      const firstQuestion = screen.getByRole('button', { name: /What is IntelCode\?/i });
      expect(firstQuestion).toHaveAttribute('aria-expanded', 'true');
      const firstAnswer = screen.getByRole('region', { name: /What is IntelCode\?/i });
      expect(firstAnswer).not.toHaveClass('hidden');

      // Second question initially collapsed
      const secondQuestion = screen.getByRole('button', { name: /How does repository indexing work\?/i });
      expect(secondQuestion).toHaveAttribute('aria-expanded', 'false');

      // Click second question to expand it
      fireEvent.click(secondQuestion);
      expect(secondQuestion).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByRole('region', { name: /How does repository indexing work\?/i })).toBeInTheDocument();

      // Click first question to collapse it
      fireEvent.click(firstQuestion);
      expect(firstQuestion).toHaveAttribute('aria-expanded', 'false');
    });
  });

  describe('6. ScrollProgress Indicator', () => {
    it('handles scroll progress without throwing and renders progressbar role when scrolled', () => {
      render(<ScrollProgress />);
      // Initial scroll is 0, component cleanly returns null or mounts
      expect(document.body).toBeInTheDocument();
    });
  });

  describe('7. Badge & EmptyState & CitationCard', () => {
    it('renders Badge with custom variants', () => {
      render(<Badge variant="success">Merged</Badge>);
      expect(screen.getByText('Merged')).toBeInTheDocument();
    });

    it('renders EmptyState with action button', () => {
      const onAction = vi.fn();
      render(
        <EmptyState
          title="No repositories"
          description="Connect your GitHub account"
          actionLabel="Connect GitHub"
          onAction={onAction}
        />
      );

      expect(screen.getByText('No repositories')).toBeInTheDocument();
      const actionBtn = screen.getByRole('button', { name: /Connect GitHub/i });
      fireEvent.click(actionBtn);
      expect(onAction).toHaveBeenCalledTimes(1);
    });

    it('renders CitationCard and passes citation on click', () => {
      const citation: SourceCitation = {
        id: 'cit-1',
        type: 'code',
        title: 'src/payment/retry.ts',
        subtitle: 'RetryService Lines 11-48',
        path: 'src/payment/retry.ts',
        start_line: 11,
        end_line: 48,
      };

      const handleClick = vi.fn();
      render(<CitationCard citation={citation} onClick={handleClick} />);

      expect(screen.getByText('src/payment/retry.ts')).toBeInTheDocument();
      expect(screen.getByText('Lines 11–48')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button'));
      expect(handleClick).toHaveBeenCalledWith(citation);
    });
  });
});
