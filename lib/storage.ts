// FaithOps AI Studio - 프로젝트 저장 (1차 MVP: localStorage)
// 추후 Supabase / SQLite 등으로 교체할 수 있도록 함수 단위로 분리한다.

import type { FaithOpsProject, OutputType, OutputStatus } from '@/lib/types';

const KEY = 'faithops:projects';

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

export function loadProjects(): FaithOpsProject[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as FaithOpsProject[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveAll(projects: FaithOpsProject[]): void {
  if (!isBrowser()) return;
  window.localStorage.setItem(KEY, JSON.stringify(projects));
}

export function getProject(id: string): FaithOpsProject | undefined {
  return loadProjects().find((p) => p.id === id);
}

export function upsertProject(project: FaithOpsProject): void {
  const projects = loadProjects();
  const idx = projects.findIndex((p) => p.id === project.id);
  if (idx >= 0) projects[idx] = project;
  else projects.unshift(project);
  saveAll(projects);
}

export function deleteProject(id: string): void {
  saveAll(loadProjects().filter((p) => p.id !== id));
}

/** 산출물 검수 상태를 갱신하고 진행률을 다시 계산한다. */
export function setOutputStatus(
  projectId: string,
  type: OutputType,
  status: OutputStatus
): FaithOpsProject | undefined {
  const project = getProject(projectId);
  if (!project) return undefined;
  project.outputs = project.outputs.map((o) =>
    o.type === type ? { ...o, status } : o
  );
  project.progress = computeProgress(project);
  project.updatedAt = new Date().toISOString();
  upsertProject(project);
  return project;
}

/** 검수(reviewed) 또는 승인(approved)된 산출물 비율을 진행률로 본다. */
export function computeProgress(project: FaithOpsProject): number {
  if (project.outputs.length === 0) return 0;
  const done = project.outputs.filter(
    (o) => o.status === 'reviewed' || o.status === 'approved'
  ).length;
  return Math.round((done / project.outputs.length) * 100);
}

export function newId(): string {
  return (
    'p_' +
    Date.now().toString(36) +
    '_' +
    Math.random().toString(36).slice(2, 8)
  );
}
