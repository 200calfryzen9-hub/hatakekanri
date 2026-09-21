'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
const supabase = url && key ? createClient(url, key) : null
const today = () => new Date().toISOString().slice(0, 10)

export default function Page() {
  const [session, setSession] = useState(null)
  const [farm, setFarm] = useState(null)
  const [data, setData] = useState({ fields: [], groups: [], systems: [], plantings: [], tasks: [] })
  const [page, setPage] = useState('home')
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  async function load(farmId) {
    const [fields, groups, systems, plantings, tasks] = await Promise.all([
      supabase.from('fields').select('*').eq('farm_id', farmId).order('name'),
      supabase.from('field_groups').select('*, group_fields(field_id)').eq('farm_id', farmId).order('name'),
      supabase.from('work_systems').select('*, work_steps(*)').eq('farm_id', farmId).order('name'),
      supabase.from('plantings').select('*, fields(name, area), work_systems(name)').eq('farm_id', farmId).order('planned_at', { ascending: false }),
      supabase.from('tasks').select('*').eq('farm_id', farmId).order('step_order'),
    ])
    const error = [fields, groups, systems, plantings, tasks].find(x => x.error)?.error
    if (error) setMessage(error.message)
    setData({ fields: fields.data || [], groups: groups.data || [], systems: systems.data || [], plantings: plantings.data || [], tasks: tasks.data || [] })
  }

  useEffect(() => {
    if (!supabase) return setLoading(false)
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {})
    supabase.auth.getSession().then(({ data: { session } }) => { setSession(session); setLoading(false) })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => subscription.unsubscribe()
  }, [])
  useEffect(() => {
    if (!session) { setFarm(null); return }
    supabase.from('farm_members').select('farms(*)').eq('user_id', session.user.id).limit(1).maybeSingle().then(({ data, error }) => {
      if (error) setMessage(error.message)
      const f = data?.farms || null; setFarm(f); if (f) load(f.id)
    })
  }, [session])
  useEffect(() => {
    if (!farm) return
    // work_steps と group_fields は farm_id を直接持たないため、RLSで許可された変更だけを受け取る。
    const channel = supabase.channel(`farm-${farm.id}`).on('postgres_changes', { event: '*', schema: 'public' }, () => load(farm.id)).subscribe()
    return () => supabase.removeChannel(channel)
  }, [farm])

  if (!supabase) return <Setup />
  if (loading) return <main className="center">読み込み中…</main>
  if (!session) return <Auth onMessage={setMessage} message={message} />
  if (!farm) return <FarmSetup user={session.user} setFarm={setFarm} message={message} setMessage={setMessage} />
  return <FarmApp {...{farm,data,page,setPage,load,message,setMessage}} signOut={() => supabase.auth.signOut()} />
}

function Setup() { return <main className="center panel"><h1>畑しごと</h1><p>公開前の設定が必要です。</p><p><code>NEXT_PUBLIC_SUPABASE_URL</code> と <code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> を Vercel の環境変数へ設定してください。</p></main> }
function Auth({ onMessage, message }) {
  const [mode, setMode] = useState('login'); const [email, setEmail] = useState(''); const [password, setPassword] = useState('')
  async function submit(e) { e.preventDefault(); const result = mode === 'login' ? await supabase.auth.signInWithPassword({email,password}) : await supabase.auth.signUp({email,password}); onMessage(result.error?.message || (mode === 'signup' ? '確認メールを送信しました。メール内のリンクを開いてください。' : '')); }
  return <main className="auth"><section className="panel"><p className="eyebrow">FARM WORK MANAGER</p><h1>畑しごと</h1><p>畑・作付け・日々の作業を、チームで共有します。</p><form onSubmit={submit}><label>メールアドレス<input type="email" required value={email} onChange={e=>setEmail(e.target.value)} /></label><label>パスワード<input type="password" minLength="6" required value={password} onChange={e=>setPassword(e.target.value)} /></label>{message && <p className="notice">{message}</p>}<button>{mode === 'login' ? 'ログイン' : 'アカウントを作成'}</button></form><button className="link" onClick={()=>{setMode(mode==='login'?'signup':'login');onMessage('')}}>{mode === 'login' ? 'はじめて使う方はこちら' : 'ログインへ戻る'}</button></section></main>
}
function FarmSetup({ user, setFarm, message, setMessage }) {
  const [mode, setMode] = useState('create'); const [name,setName]=useState(''); const [code,setCode]=useState('')
  async function submit(e) { e.preventDefault(); const rpc = mode==='create' ? ['create_farm',{p_name:name}] : ['join_farm',{p_access_code:code}]; const {data,error}=await supabase.rpc(...rpc); if(error) return setMessage(error.message); setFarm(data); }
  return <main className="auth"><section className="panel"><h1>{mode==='create'?'農場を作成':'農場に参加'}</h1><p>{mode==='create'?'最初の農場を作ると、共有コードが発行されます。':'管理者から受け取った共有コードを入力してください。'}</p><form onSubmit={submit}><label>{mode==='create'?'農場名':'共有コード'}<input required value={mode==='create'?name:code} onChange={e=>mode==='create'?setName(e.target.value):setCode(e.target.value)} /></label>{message&&<p className="notice">{message}</p>}<button>{mode==='create'?'農場を作成':'参加する'}</button></form><button className="link" onClick={()=>{setMode(mode==='create'?'join':'create');setMessage('')}}>{mode==='create'?'共有コードを使って参加':'新しい農場を作成'}</button></section></main>
}
function FarmApp({ farm,data,page,setPage,load,message,setMessage,signOut }) {
  const [show, setShow] = useState(null)
  const tasks = data.tasks; const pTasks = id => tasks.filter(t=>t.planting_id===id); const status = p => { const ts=pTasks(p.id); return !ts.some(t=>t.done_at)?['未着手','todo']:ts.every(t=>t.done_at)?['完了','done']:['進行中','progress'] }
  const complete = async t => { const {error}=await supabase.from('tasks').update({done_at:today()}).eq('id',t.id); if(error)setMessage(error.message); else load(farm.id) }
  const content = { home:<Home data={data} pTasks={pTasks} status={status} complete={complete}/>, fields:<Fields data={data} farm={farm} reload={()=>load(farm.id)} open={setShow}/>, plantings:<Plantings data={data} status={status} open={setShow}/>, tasks:<Tasks tasks={tasks} plantings={data.plantings} complete={complete}/>, systems:<Systems systems={data.systems} open={setShow}/> }[page]
  return <><header><div><p className="eyebrow">共有農場</p><h1>{farm.name}</h1></div><div className="share">共有コード <b>{farm.access_code}</b><button className="link" onClick={signOut}>ログアウト</button></div></header><nav>{[['home','ホーム'],['fields','畑・グループ'],['plantings','作付け'],['tasks','作業'],['systems','作業体系']].map(([id,label])=><button className={page===id?'active':''} onClick={()=>setPage(id)} key={id}>{label}</button>)}</nav><main>{message&&<p className="notice">{message}</p>}{content}</main>{show&&<Dialog type={show} data={data} farm={farm} close={()=>setShow(null)} reload={()=>load(farm.id)} />}</>
}
function Home({data,pTasks,status,complete}) { const open=data.tasks.filter(t=>!t.done_at); return <><PageHead title="現在の作業状況" text="今日やることと、作付けの進み具合を確認します。"/><div className="stats"><Stat label="未完了の作業" value={open.length}/><Stat label="今日完了" value={data.tasks.filter(t=>t.done_at===today()).length}/><Stat label="進行中の作付け" value={data.plantings.filter(p=>status(p)[1]==='progress').length}/><Stat label="登録した畑" value={data.fields.length}/></div><div className="columns"><section className="card"><h2>未完了の作業</h2>{open.length?<ul>{open.slice(0,8).map(t=><TaskLine key={t.id} task={t} plantings={data.plantings} complete={complete}/>)}</ul>:<Empty text="未完了の作業はありません。"/>}</section><section className="card"><h2>作付けの進捗</h2>{data.plantings.length?<ul>{data.plantings.map(p=>{const [n,c]=status(p),ts=pTasks(p.id);return <li key={p.id}><span><b>{p.fields?.name} ・ {p.crop}</b><small>{ts.filter(t=>t.done_at).length}/{ts.length} 作業完了</small></span><Badge name={n} cls={c}/></li>})}</ul>:<Empty text="作付けを登録すると表示されます。"/>}</section></div></> }
function Fields({data,open}) { return <><PageHead title="畑・グループ" text="畑の面積と、作業しやすい単位のグループを管理します。" action="＋ 畑を登録" onAction={()=>open('field')}/><div className="columns"><section className="card"><h2>畑一覧（{data.fields.length}件）</h2>{data.fields.length?<ul>{data.fields.map(f=><li key={f.id}><span><b>{f.name}</b><small>{f.area} a {f.memo&&`・ ${f.memo}`}</small></span></li>)}</ul>:<Empty text="畑を登録してください。"/>}</section><section className="card"><h2>グループ <button className="minor" onClick={()=>open('group')}>＋作成</button></h2>{data.groups.length?<ul>{data.groups.map(g=><li key={g.id}><span><b>{g.name}</b><small>{g.group_fields?.length||0}件の畑</small></span></li>)}</ul>:<Empty text="例: 自宅周辺、南地区のように畑をまとめられます。"/>}</section></div></> }
function Plantings({data,status,open}) { return <><PageHead title="作付け一覧" text="どの畑で何を作っているか、作業の進捗と一緒に確認します。" action="＋ 作付けを登録" onAction={()=>open('planting')}/>{data.plantings.length?<div className="card tablewrap"><table><thead><tr><th>畑</th><th>面積</th><th>作物</th><th>作業体系</th><th>予定日</th><th>状態</th></tr></thead><tbody>{data.plantings.map(p=>{const [n,c]=status(p);return <tr key={p.id}><td>{p.fields?.name}</td><td>{p.fields?.area} a</td><td>{p.crop}</td><td>{p.work_systems?.name}</td><td>{p.planned_at}</td><td><Badge name={n} cls={c}/></td></tr>})}</tbody></table></div>:<Empty text="作付けを登録すると、ここに進捗が表示されます。"/>}</> }
function Tasks({tasks,plantings,complete}) { const p=t=>plantings.find(x=>x.id===t.planting_id);return <><PageHead title="作業ToDo・実績" text="完了を押すと本日の日付を記録します。"/><div className="columns"><section className="card"><h2>未完了（{tasks.filter(t=>!t.done_at).length}件）</h2><ul>{tasks.filter(t=>!t.done_at).map(t=><TaskLine key={t.id} task={t} plantings={plantings} complete={complete}/>)}</ul></section><section className="card"><h2>完了済み（{tasks.filter(t=>t.done_at).length}件）</h2><ul>{tasks.filter(t=>t.done_at).map(t=><li key={t.id}><span><b>{t.name}</b><small>{p(t)?.fields?.name} ・ {t.done_at}</small></span><Badge name="完了" cls="done"/></li>)}</ul></section></div></> }
function Systems({systems,open}) { return <><PageHead title="作業体系" text="作物ごとの作業順をテンプレートとして登録します。" action="＋ 作業体系を登録" onAction={()=>open('system')}/><div className="columns">{systems.map(s=><section className="card" key={s.id}><h2>{s.name}</h2><p>{s.crop}</p><ol>{(s.work_steps||[]).sort((a,b)=>a.step_order-b.step_order).map(x=><li key={x.id}>{x.name}</li>)}</ol></section>)}</div>{!systems.length&&<Empty text="最初に作業体系を登録してください。"/>}</> }
function Dialog({type,data,farm,close,reload}) { const [name,setName]=useState(''); const [area,setArea]=useState(''); const [memo,setMemo]=useState(''); const [crop,setCrop]=useState('燕麦');const [systemId,setSystemId]=useState('');const [fieldIds,setFieldIds]=useState([]);const [steps,setSteps]=useState('耕起\n播種\n鎮圧'); const [error,setError]=useState(''); const titles={field:'畑を登録',group:'グループを作成',system:'作業体系を登録',planting:'作付けを登録'};
  const submit=async e=>{e.preventDefault();let r;if(type==='field')r=await supabase.from('fields').insert({farm_id:farm.id,name,area:Number(area),memo});if(type==='group'){r=await supabase.from('field_groups').insert({farm_id:farm.id,name}).select().single();if(!r.error&&fieldIds.length)r=await supabase.from('group_fields').insert(fieldIds.map(field_id=>({group_id:r.data.id,field_id})));}if(type==='system'){r=await supabase.from('work_systems').insert({farm_id:farm.id,name,crop}).select().single();if(!r.error)r=await supabase.from('work_steps').insert(steps.split('\n').filter(Boolean).map((x,i)=>({system_id:r.data.id,name:x.trim(),step_order:i+1})));}if(type==='planting'){const sys=data.systems.find(x=>x.id===systemId);if(!sys||!fieldIds.length)return setError('作業体系と対象畑を選択してください。');for(const field_id of fieldIds){const p=await supabase.from('plantings').insert({farm_id:farm.id,field_id,crop,system_id:systemId,planned_at:today()}).select().single();if(p.error){r=p;break}r=await supabase.from('tasks').insert((sys.work_steps||[]).map(s=>({farm_id:farm.id,planting_id:p.data.id,name:s.name,step_order:s.step_order})));if(r.error)break}}if(r?.error)return setError(r.error.message);close();reload()}
  return <div className="backdrop"><form className="dialog" onSubmit={submit}><h2>{titles[type]}</h2>{type==='field'&&<><Label t="畑名"><input required value={name} onChange={e=>setName(e.target.value)}/></Label><Label t="面積（a）"><input type="number" min="0.1" step="0.1" required value={area} onChange={e=>setArea(e.target.value)}/></Label><Label t="メモ"><textarea value={memo} onChange={e=>setMemo(e.target.value)}/></Label></>}{type==='group'&&<><Label t="グループ名"><input required value={name} onChange={e=>setName(e.target.value)}/></Label><CheckList items={data.fields} selected={fieldIds} setSelected={setFieldIds}/></>}{type==='system'&&<><Label t="作業体系名"><input required value={name} onChange={e=>setName(e.target.value)} placeholder="例: 燕麦9"/></Label><Label t="作物"><input required value={crop} onChange={e=>setCrop(e.target.value)}/></Label><Label t="作業（1行に1つ）"><textarea required value={steps} onChange={e=>setSteps(e.target.value)}/></Label></>}{type==='planting'&&<><Label t="作物"><input required value={crop} onChange={e=>setCrop(e.target.value)}/></Label><Label t="作業体系"><select required value={systemId} onChange={e=>setSystemId(e.target.value)}><option value="">選択してください</option>{data.systems.map(s=><option key={s.id} value={s.id}>{s.name}（{s.crop}）</option>)}</select></Label><CheckList items={data.fields} selected={fieldIds} setSelected={setFieldIds}/></>}{error&&<p className="notice">{error}</p>}<footer><button type="button" className="secondary" onClick={close}>キャンセル</button><button>保存</button></footer></form></div> }
function CheckList({items,selected,setSelected}) { return <fieldset><legend>対象の畑を選択</legend>{items.map(f=><label className="check" key={f.id}><input type="checkbox" checked={selected.includes(f.id)} onChange={e=>setSelected(e.target.checked?[...selected,f.id]:selected.filter(x=>x!==f.id))}/>{f.name}（{f.area}a）</label>)}</fieldset> }
function Label({t,children}) { return <label>{t}{children}</label> }; function PageHead({title,text,action,onAction}) {return <section className="pagehead"><div><h1>{title}</h1><p>{text}</p></div>{action&&<button onClick={onAction}>{action}</button>}</section>};function Stat({label,value}){return <div className="stat"><small>{label}</small><b>{value}</b></div>};function Empty({text}){return <p className="empty">{text}</p>};function Badge({name,cls}){return <span className={'badge '+cls}>{name}</span>};function TaskLine({task,plantings,complete}){const p=plantings.find(x=>x.id===task.planting_id);return <li><span><b>{task.name}</b><small>{p?.fields?.name} ・ {p?.crop}</small></span><button onClick={()=>complete(task)}>完了</button></li>}
