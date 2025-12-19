import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axios from 'axios'
import ContestList from './ContestList'

vi.mock('axios')

const mockNavigate = vi.fn()

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key, options) => {
      if (options && typeof options.name === 'string') {
        return `${key}:${options.name}`
      }
      if (options && typeof options.page === 'number' && typeof options.totalPages === 'number') {
        return `${key}:${options.page}/${options.totalPages}`
      }
      return key
    }
  })
}))

const mockedAxios = axios

describe('ContestList', () => {
  beforeEach(() => {
    sessionStorage.clear()
    vi.clearAllMocks()
  })

  test('loads contests and renders list with join buttons', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        items: [
          {
            id: 1,
            name: 'Contest 1',
            description: 'Desc',
            startTime: new Date(Date.now() - 3600000).toISOString(),
            endTime: new Date(Date.now() + 3600000).toISOString(),
            rule: 'OI',
            participantCount: 5,
            hasPassword: true
          }
        ],
        page: 1,
        pageSize: 10,
        total: 1
      }
    })

    render(<ContestList />)

    expect(screen.getByText('common.loading')).toBeInTheDocument()

    expect(mockedAxios.get).toHaveBeenCalledWith('/api/contests/public', {
      params: { page: 1, pageSize: 10 }
    })

    expect(await screen.findByText('Contest 1')).toBeInTheDocument()
    expect(screen.getByText('contest.list.join')).toBeInTheDocument()
  })

  test('opens password modal and joins contest successfully', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        items: [
          {
            id: 2,
            name: 'Protected Contest',
            description: '',
            startTime: new Date(Date.now() - 3600000).toISOString(),
            endTime: new Date(Date.now() + 3600000).toISOString(),
            rule: 'ACM',
            participantCount: 10,
            hasPassword: true
          }
        ],
        page: 1,
        pageSize: 10,
        total: 1
      }
    })

    mockedAxios.post.mockResolvedValueOnce({
      data: { success: true }
    })

    render(<ContestList />)

    const joinButton = await screen.findByText('contest.list.join')
    await userEvent.click(joinButton)

    const passwordInput = await screen.findByPlaceholderText('contest.password.placeholder')
    await userEvent.type(passwordInput, 'secret')

    const submitButton = screen.getByText('contest.password.submit')
    await userEvent.click(submitButton)

    await waitFor(() => {
      expect(mockedAxios.post).toHaveBeenCalledWith('/api/contests/2/join', {
        password: 'secret'
      })
      expect(sessionStorage.getItem('contest_access_2')).toBe('true')
      expect(mockNavigate).toHaveBeenCalledWith('/contest/2')
    })
  })

  test('shows error message when join request fails', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        items: [
          {
            id: 3,
            name: 'Error Contest',
            description: '',
            startTime: new Date(Date.now() - 3600000).toISOString(),
            endTime: new Date(Date.now() + 3600000).toISOString(),
            rule: 'OI',
            participantCount: 0,
            hasPassword: true
          }
        ],
        page: 1,
        pageSize: 10,
        total: 1
      }
    })

    mockedAxios.post.mockRejectedValueOnce({
      response: {
        data: {
          error: 'Wrong password'
        }
      }
    })

    render(<ContestList />)

    const joinButton = await screen.findByText('contest.list.join')
    await userEvent.click(joinButton)

    const passwordInput = await screen.findByPlaceholderText('contest.password.placeholder')
    await userEvent.type(passwordInput, 'bad')

    const submitButton = screen.getByText('contest.password.submit')
    await userEvent.click(submitButton)

    expect(await screen.findByText('Wrong password')).toBeInTheDocument()
  })
})
