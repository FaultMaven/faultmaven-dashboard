import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useNavigationItems } from '../../hooks/useNavigationItems';

// Mock AuthContext to control deployment and role
vi.mock('../../context/AuthContext', () => ({
  useAuth: vi.fn(),
}));

import { useAuth } from '../../context/AuthContext';

const mockUseAuth = useAuth as ReturnType<typeof vi.fn>;

describe('useNavigationItems', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('standalone user sees Cases, Knowledge Base, LLM Settings — no Users', () => {
    mockUseAuth.mockReturnValue({ deployment: 'standalone', role: 'individual' });

    const { result } = renderHook(() => useNavigationItems('/cases'));
    const labels = result.current.map((i) => i.label);

    expect(labels).toContain('Cases');
    expect(labels).toContain('Knowledge Base');
    expect(labels).toContain('LLM Settings');
    expect(labels).not.toContain('Users');
  });

  it('cloud standard_user sees Cases, Knowledge Base — no LLM Settings, no Users', () => {
    mockUseAuth.mockReturnValue({ deployment: 'cloud', role: 'standard_user' });

    const { result } = renderHook(() => useNavigationItems('/kb'));
    const labels = result.current.map((i) => i.label);

    expect(labels).toContain('Cases');
    expect(labels).toContain('Knowledge Base');
    expect(labels).not.toContain('LLM Settings');
    expect(labels).not.toContain('Users');
  });

  it('cloud platform_admin sees all four nav items', () => {
    mockUseAuth.mockReturnValue({ deployment: 'cloud', role: 'platform_admin' });

    const { result } = renderHook(() => useNavigationItems('/admin/users'));
    const labels = result.current.map((i) => i.label);

    expect(labels).toContain('Cases');
    expect(labels).toContain('Knowledge Base');
    expect(labels).toContain('LLM Settings');
    expect(labels).toContain('Users');
  });

  it('marks item active when currentPath matches exactly', () => {
    mockUseAuth.mockReturnValue({ deployment: 'standalone', role: 'individual' });

    const { result } = renderHook(() => useNavigationItems('/cases'));
    const casesItem = result.current.find((i) => i.path === '/cases');

    expect(casesItem?.active).toBe(true);
  });

  it('marks item active when currentPath is a sub-path', () => {
    mockUseAuth.mockReturnValue({ deployment: 'standalone', role: 'individual' });

    const { result } = renderHook(() => useNavigationItems('/cases/abc-123'));
    const casesItem = result.current.find((i) => i.path === '/cases');
    const kbItem = result.current.find((i) => i.path === '/kb');

    expect(casesItem?.active).toBe(true);
    expect(kbItem?.active).toBe(false);
  });

  it('no item is active when path does not match any nav item', () => {
    mockUseAuth.mockReturnValue({ deployment: 'standalone', role: 'individual' });

    const { result } = renderHook(() => useNavigationItems('/login'));
    const anyActive = result.current.some((i) => i.active);

    expect(anyActive).toBe(false);
  });

  it('null deployment/role shows base items only (loading state)', () => {
    mockUseAuth.mockReturnValue({ deployment: null, role: null });

    const { result } = renderHook(() => useNavigationItems('/cases'));
    const labels = result.current.map((i) => i.label);

    expect(labels).toContain('Cases');
    expect(labels).toContain('Knowledge Base');
    expect(labels).not.toContain('LLM Settings');
    expect(labels).not.toContain('Users');
  });
});
