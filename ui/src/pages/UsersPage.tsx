import { useState } from 'react'
import {
  useCreateUser,
  useDeleteUser,
  useUpdateUser,
  useUsers,
  type PanelUser,
} from '../hooks/useUsers'
import { useMe } from '../hooks/useMe'
import {
  ErrorBox,
  Field,
  PageTitle,
  Section,
  TextInput,
} from '../components/config/fields'

const GRANT_LABELS: Record<string, string> = {
  dsp: 'Audio processing',
  autodj: 'AutoDJ library',
  branding: 'Station & branding',
}

const selectClass =
  'w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-100'

function GrantPicker({
  grants,
  available,
  onChange,
}: {
  grants: string[]
  available: string[]
  onChange: (grants: string[]) => void
}) {
  return (
    <div className="flex flex-wrap gap-3">
      {available.map((grant) => (
        <label key={grant} className="flex items-center gap-1.5 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={grants.includes(grant)}
            onChange={(e) =>
              onChange(
                e.target.checked
                  ? [...grants, grant]
                  : grants.filter((g) => g !== grant),
              )
            }
            className="accent-red-600"
          />
          {GRANT_LABELS[grant] ?? grant}
        </label>
      ))}
    </div>
  )
}

function UserRow({ user, grants }: { user: PanelUser; grants: string[] }) {
  const { data: me } = useMe()
  const update = useUpdateUser()
  const remove = useDeleteUser()
  const [password, setPassword] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const isSelf = me?.name === user.name

  return (
    <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-medium text-zinc-100">{user.name}</span>
          {isSelf && <span className="text-xs text-zinc-500">(you)</span>}
          <span
            className={`rounded px-2 py-0.5 text-xs font-medium ${
              user.role === 'admin'
                ? 'bg-red-900/60 text-red-300'
                : 'bg-zinc-700 text-zinc-300'
            }`}
          >
            {user.role}
          </span>
        </div>

        {!isSelf && (
          <button
            onClick={() => {
              if (!confirmDelete) {
                setConfirmDelete(true)
                setTimeout(() => setConfirmDelete(false), 4000)
                return
              }
              remove.mutate(user.name)
            }}
            className="text-sm text-zinc-500 hover:text-red-400"
          >
            {confirmDelete ? 'Click again to delete' : 'Delete'}
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Role">
          <select
            value={user.role}
            onChange={(e) => update.mutate({ name: user.name, role: e.target.value })}
            className={selectClass}
          >
            <option value="admin">admin — full access</option>
            <option value="staff">staff — read-only + grants</option>
          </select>
        </Field>

        <Field label="New password" hint="Min 8 characters; logs their other sessions out">
          <div className="flex gap-2">
            <TextInput value={password} onChange={setPassword} placeholder="••••••••" />
            <button
              disabled={password.length < 8 || update.isPending}
              onClick={() => {
                update.mutate({ name: user.name, password })
                setPassword('')
              }}
              className="shrink-0 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
            >
              Set
            </button>
          </div>
        </Field>
      </div>

      {user.role === 'staff' && (
        <Field label="Grants" hint="What this staff user can modify (they can view everything)">
          <GrantPicker
            grants={user.grants}
            available={grants}
            onChange={(next) => update.mutate({ name: user.name, grants: next })}
          />
        </Field>
      )}

      <ErrorBox error={update.error ?? remove.error} />
    </div>
  )
}

export default function UsersPage() {
  const { data, error } = useUsers()
  const create = useCreateUser()
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('staff')
  const [grants, setGrants] = useState<string[]>([])

  if (error) return <ErrorBox error={error} />
  if (!data) return <div className="py-20 text-center text-zinc-500">Loading...</div>

  const submit = () =>
    create.mutate(
      { name: name.trim(), password, role, grants: role === 'staff' ? grants : [] },
      {
        onSuccess: () => {
          setName('')
          setPassword('')
          setGrants([])
        },
      },
    )

  return (
    <>
      <PageTitle
        title="Users"
        subtitle="Who can sign in to this panel. Staff see everything; grants control what they can change."
      />

      <div className="space-y-4">
        {data.users.map((user) => (
          <UserRow key={user.name} user={user} grants={data.grants} />
        ))}
      </div>

      <Section title="Add user">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Username">
            <TextInput value={name} onChange={setName} placeholder="e.g. maria" />
          </Field>
          <Field label="Password" hint="Min 8 characters">
            <TextInput value={password} onChange={setPassword} placeholder="••••••••" />
          </Field>
          <Field label="Role">
            <select value={role} onChange={(e) => setRole(e.target.value)} className={selectClass}>
              <option value="staff">staff — read-only + grants</option>
              <option value="admin">admin — full access</option>
            </select>
          </Field>
          {role === 'staff' && (
            <Field label="Grants">
              <GrantPicker grants={grants} available={data.grants} onChange={setGrants} />
            </Field>
          )}
        </div>

        <ErrorBox error={create.error} />

        <button
          disabled={!name.trim() || password.length < 8 || create.isPending}
          onClick={submit}
          className="rounded-lg bg-red-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-50"
        >
          {create.isPending ? 'Creating…' : 'Create user'}
        </button>
      </Section>
    </>
  )
}
