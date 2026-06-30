'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/field';
import { OutputTabs } from '@/components/OutputTabs';
import { OutputCard } from '@/components/OutputCard';
import { ProgressDashboard } from '@/components/ProgressDashboard';
import {
  getProject,
  upsertProject,
  setOutputStatus,
} from '@/lib/storage';
import type {
  FaithOpsProject,
  GeneratedOutput,
  OutputType,
  OutputStatus,
} from '@/lib/types';

const SLACK_KEY = 'faithops:slackWebhook';

export default function ResultsPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [project, setProject] = React.useState<FaithOpsProject | null>(null);
  const [ready, setReady] = React.useState(false);
  const [active, setActive] = React.useState<OutputType | null>(null);
  const [regenerating, setRegenerating] = React.useState<OutputType | null>(null);
  const [webhook, setWebhook] = React.useState('');
  const [slackMsg, setSlackMsg] = React.useState<string | null>(null);

  React.useEffect(() => {
    const p = getProject(id);
    setProject(p ?? null);
    if (p && p.outputs.length > 0) setActive(p.outputs[0].type);
    setReady(true);
    setWebhook(window.localStorage.getItem(SLACK_KEY) ?? '');
  }, [id]);

  function refresh() {
    const p = getProject(id);
    setProject(p ?? null);
  }

  async function handleRegenerate(type: OutputType) {
    if (!project) return;
    setRegenerating(type);
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: project.input, types: [type] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const fresh = (data.outputs as GeneratedOutput[])[0];
      const updated: FaithOpsProject = {
        ...project,
        outputs: project.outputs.map((o) => (o.type === type ? fresh : o)),
        updatedAt: new Date().toISOString(),
      };
      upsertProject(updated);
      setProject(updated);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : '다시 생성 실패');
    } finally {
      setRegenerating(null);
    }
  }

  function handleStatus(type: OutputType, status: OutputStatus) {
    const updated = setOutputStatus(id, type, status);
    if (updated) setProject({ ...updated });
  }

  async function handleSendSlack(text: string) {
    window.localStorage.setItem(SLACK_KEY, webhook);
    setSlackMsg('전송 중…');
    try {
      const res = await fetch('/api/slack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, webhookUrl: webhook }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSlackMsg('✓ Slack 으로 전송되었습니다.');
    } catch (e) {
      setSlackMsg('전송 실패: ' + (e instanceof Error ? e.message : ''));
    }
  }

  if (!ready) {
    return <p className="text-sm text-muted-foreground">불러오는 중…</p>;
  }

  if (!project) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">
            프로젝트를 찾을 수 없습니다. (다른 기기/브라우저에서 생성된 자료일 수
            있습니다)
          </p>
          <Link href="/create" className="mt-4 inline-block">
            <Button>새 자료 생성</Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  const activeOutput =
    project.outputs.find((o) => o.type === active) ?? project.outputs[0];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            {project.input.bibleReference || '예배자료'}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {project.input.churchName ? project.input.churchName + ' · ' : ''}
            {project.input.audience} · {project.input.serviceType}
          </p>
        </div>
        <Link href="/projects">
          <Button variant="outline" size="sm">
            보관함
          </Button>
        </Link>
      </div>

      <ProgressDashboard project={project} />

      <OutputTabs
        outputs={project.outputs}
        active={activeOutput.type}
        onSelect={setActive}
      />

      {activeOutput.type === 'slackReport' && (
        <Card>
          <CardContent className="space-y-2 pt-5">
            <p className="text-sm font-medium">Slack Webhook URL</p>
            <div className="flex flex-wrap gap-2">
              <Input
                placeholder="https://hooks.slack.com/services/..."
                value={webhook}
                onChange={(e) => setWebhook(e.target.value)}
                className="flex-1"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              URL 은 이 브라우저에만 저장됩니다. 비워두면 서버 환경변수
              (SLACK_WEBHOOK_URL) 를 사용합니다.
            </p>
            {slackMsg && (
              <p className="text-sm text-primary">{slackMsg}</p>
            )}
          </CardContent>
        </Card>
      )}

      <OutputCard
        output={activeOutput}
        regenerating={regenerating === activeOutput.type}
        onRegenerate={() => handleRegenerate(activeOutput.type)}
        onStatusChange={(status) => handleStatus(activeOutput.type, status)}
        isSlack={activeOutput.type === 'slackReport'}
        onSendSlack={() => handleSendSlack(activeOutput.content)}
      />
    </div>
  );
}
