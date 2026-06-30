'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input, Textarea, Select, Label } from '@/components/ui/field';
import { Card, CardContent } from '@/components/ui/card';
import {
  AUDIENCES,
  SERVICE_TYPES,
  SERMON_LENGTHS,
  TONES,
  IMAGE_STYLES,
  ALL_OUTPUT_TYPES,
  OUTPUT_META,
} from '@/lib/types';
import type { ProjectInput, OutputType, Audience } from '@/lib/types';

const DEFAULT_INPUT: ProjectInput = {
  bibleReference: '',
  bibleText: '',
  audience: '아동부',
  serviceType: '주일예배',
  sermonLength: '10분',
  tone: '복음 중심',
  imageStyle: '어린이 성경 그림책',
  churchName: '',
  departmentName: '',
  serviceDate: '',
  outputs: [...ALL_OUTPUT_TYPES],
};

export function BibleInputForm({
  loading,
  onGenerate,
}: {
  loading: boolean;
  onGenerate: (input: ProjectInput) => void;
}) {
  const [form, setForm] = React.useState<ProjectInput>(DEFAULT_INPUT);
  const [error, setError] = React.useState<string | null>(null);

  function update<K extends keyof ProjectInput>(key: K, value: ProjectInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function toggleOutput(type: OutputType) {
    setForm((f) => {
      const has = f.outputs.includes(type);
      const outputs = has
        ? f.outputs.filter((t) => t !== type)
        : [...f.outputs, type];
      return { ...f, outputs };
    });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.bibleReference.trim() && !form.bibleText.trim()) {
      setError('성경본문 주소 또는 본문 텍스트 중 하나는 입력해야 합니다.');
      return;
    }
    if (form.outputs.length === 0) {
      setError('생성할 산출물을 최소 1개 이상 선택하세요.');
      return;
    }
    setError(null);
    onGenerate(form);
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <Card>
        <CardContent className="space-y-4 pt-5">
          <div>
            <Label htmlFor="ref">성경본문 주소 *</Label>
            <Input
              id="ref"
              placeholder="예: 누가복음 15:11-32"
              value={form.bibleReference}
              onChange={(e) => update('bibleReference', e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="text">본문 텍스트 (붙여넣기 권장)</Label>
            <Textarea
              id="text"
              placeholder="성경 번역본 저작권을 고려해 본문 텍스트를 직접 붙여넣어 주세요."
              value={form.bibleText}
              onChange={(e) => update('bibleText', e.target.value)}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              본문 텍스트를 입력하면 더 정밀한 분석 결과를 얻을 수 있습니다.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="grid grid-cols-1 gap-4 pt-5 sm:grid-cols-2">
          <div>
            <Label>예배 대상</Label>
            <Select
              value={form.audience}
              onChange={(e) => update('audience', e.target.value as Audience)}
            >
              {AUDIENCES.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>예배 유형</Label>
            <Select
              value={form.serviceType}
              onChange={(e) => update('serviceType', e.target.value)}
            >
              {SERVICE_TYPES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>설교 길이</Label>
            <Select
              value={form.sermonLength}
              onChange={(e) => update('sermonLength', e.target.value)}
            >
              {SERMON_LENGTHS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>설교 방향</Label>
            <Select
              value={form.tone}
              onChange={(e) => update('tone', e.target.value)}
            >
              {TONES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>이미지 스타일</Label>
            <Select
              value={form.imageStyle}
              onChange={(e) => update('imageStyle', e.target.value)}
            >
              {IMAGE_STYLES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>예배일</Label>
            <Input
              type="date"
              value={form.serviceDate}
              onChange={(e) => update('serviceDate', e.target.value)}
            />
          </div>
          <div>
            <Label>교회명</Label>
            <Input
              placeholder="예: 비전성음교회"
              value={form.churchName}
              onChange={(e) => update('churchName', e.target.value)}
            />
          </div>
          <div>
            <Label>부서명</Label>
            <Input
              placeholder="예: 아동부"
              value={form.departmentName}
              onChange={(e) => update('departmentName', e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5">
          <Label>생성할 산출물 선택</Label>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {ALL_OUTPUT_TYPES.map((type) => {
              const active = form.outputs.includes(type);
              return (
                <button
                  type="button"
                  key={type}
                  onClick={() => toggleOutput(type)}
                  className={
                    'flex flex-col rounded-md border px-3 py-2 text-left text-sm transition-colors ' +
                    (active
                      ? 'border-primary bg-accent text-accent-foreground'
                      : 'border-border bg-white text-muted-foreground hover:bg-muted')
                  }
                >
                  <span className="font-medium">
                    {active ? '☑ ' : '☐ '}
                    {OUTPUT_META[type].label}
                  </span>
                  <span className="text-xs opacity-80">
                    {OUTPUT_META[type].description}
                  </span>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
          {error}
        </p>
      )}

      <div className="flex justify-end">
        <Button type="submit" size="lg" disabled={loading}>
          {loading ? '생성 중…' : '✨ 예배자료 생성하기'}
        </Button>
      </div>
    </form>
  );
}
