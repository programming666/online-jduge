import React, { useState } from 'react'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import MarkdownEditorWithPreview from './MarkdownEditorWithPreview'

describe('MarkdownEditorWithPreview', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  test('toggle preview button updates label and localStorage', async () => {
    render(
      <MarkdownEditorWithPreview
        value=""
        onChange={() => {}}
        storageKey="problem-desc"
        label="描述"
        placeholder="请输入描述"
      />
    )

    const toggleButton = screen.getByText('隐藏预览')
    expect(toggleButton).toBeInTheDocument()

    fireEvent.click(toggleButton)

    expect(screen.getByText('显示预览')).toBeInTheDocument()
    expect(localStorage.getItem('problem-desc:previewVisible')).toBe('false')

    fireEvent.click(screen.getByText('显示预览'))

    expect(screen.getByText('隐藏预览')).toBeInTheDocument()
    expect(localStorage.getItem('problem-desc:previewVisible')).toBe('true')
  })

  test('initial preview visibility respects localStorage persisted flag', () => {
    localStorage.setItem('problem-desc:previewVisible', 'false')

    render(
      <MarkdownEditorWithPreview
        value=""
        onChange={() => {}}
        storageKey="problem-desc"
        label="描述"
        placeholder="请输入描述"
      />
    )

    expect(screen.getByText('显示预览')).toBeInTheDocument()
  })

  test('updates preview content when textarea changes', async () => {
    function Wrapper() {
      const [value, setValue] = useState('')
      return (
        <MarkdownEditorWithPreview
          value={value}
          onChange={setValue}
          storageKey="md-test"
          label="内容"
          placeholder="输入内容"
        />
      )
    }

    render(<Wrapper />)

    const textarea = screen.getByPlaceholderText('输入内容')
    fireEvent.change(textarea, { target: { value: 'Hello preview' } })

    await waitFor(() => {
      expect(screen.getByText('Hello preview')).toBeInTheDocument()
    })
  })
})
