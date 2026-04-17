const supabaseOk = typeof window.HE !== 'undefined' && window.HE && typeof window.HE.Auth !== 'undefined';

/* ─── DATA ─── */
const EMBEDDED_CATS = [
  { id: 'all', label: 'الكل', icon: '' },
  { id: 'women', label: 'عطور نسائية', icon: '' },
  { id: 'men', label: 'عطور رجالية', icon: '' },
  { id: 'unisex', label: 'عطور يونيسكس', icon: '' },
  { id: 'niche', label: 'عطور نيش', icon: '' },
  { id: 'oud', label: 'عطور العود', icon: '' },
  { id: 'gift', label: 'مجموعات هدايا', icon: '' },
  { id: 'care', label: 'العناية والتعطير', icon: '' }
];

/* بيانات افتراضية لمتجر العطور */
const EMBEDDED_PRODUCTS = [
  { id: 101, n: 'لافيير روز', em: '', c: 'women', p: 89000, v: ['50ml', '100ml'] },
  { id: 102, n: 'مس دو فلور', em: '', c: 'women', p: 97000, v: ['50ml', '100ml', '150ml'] },
  { id: 103, n: 'إلجينت بلوم', em: '', c: 'women', p: 76000, v: ['30ml', '75ml'] },
  { id: 104, n: 'أمبريال وود', em: '', c: 'men', p: 99000, v: ['75ml', '125ml'] },
  { id: 105, n: 'نايت ليذر', em: '', c: 'men', p: 92000, v: ['60ml', '100ml'] },
  { id: 106, n: 'سيغنتشر كود', em: '', c: 'men', p: 84000, v: ['50ml', '100ml'] },
  { id: 107, n: 'أورا بلاتين', em: '', c: 'unisex', p: 108000, v: ['50ml', '100ml'] },
  { id: 108, n: 'فيلفيت سموك', em: '', c: 'unisex', p: 95000, v: ['75ml', '125ml'] },
  { id: 109, n: 'العود الملكي', em: '', c: 'oud', p: 145000, v: ['30ml', '60ml'] },
  { id: 110, n: 'مخلط شرقي فاخر', em: '', c: 'oud', p: 158000, v: ['30ml', '50ml'] },
  { id: 111, n: 'نيش 27', em: '', c: 'niche', p: 189000, v: ['50ml', '100ml'] },
  { id: 112, n: 'أوبسيديان نوت', em: '', c: 'niche', p: 176000, v: ['50ml', '90ml'] },
  { id: 113, n: 'صندوق هدايا برستيج', em: '', c: 'gift', p: 125000, v: ['Classic', 'Premium'] },
  { id: 114, n: 'مجموعة مناسبات', em: '', c: 'gift', p: 139000, v: ['3 قطع', '5 قطع'] },
  { id: 115, n: 'بودي ميست حريري', em: '', c: 'care', p: 39000, v: ['120ml', '200ml'] },
  { id: 116, n: 'لوشن معطّر فاخر', em: '', c: 'care', p: 42000, v: ['150ml', '250ml'] }
];

let CATS = EMBEDDED_CATS;
let PRODUCTS = EMBEDDED_PRODUCTS;

/* ─── ASSOCIATION RULES ─── */
const RULES = {
  101: [107, 113, 115, 111],
  104: [109, 114, 116, 112],
  107: [111, 113, 115, 109],
  109: [110, 112, 114, 116],
  113: [101, 104, 107, 109]
};

function productById(id){
  return PRODUCTS.find(x=>x.id===id||String(x.id)===String(id));
}

function domId(id){
  return String(id).replace(/[^a-zA-Z0-9_-]/g,'_');
}

function mapDbProductToLocal(p){
  const slug=(p.category&&p.category.slug)||p.c||'';
  let v=[];
  let variantRows=[];
  if(Array.isArray(p.variants)&&p.variants.length){
    const sorted=p.variants.slice().sort((a,b)=>(a.sort_order||0)-(b.sort_order||0));
    v=sorted.map(x=>x.name_ar);
    variantRows=sorted.map(x=>({name:x.name_ar,delta:Number(x.price_delta)||0}));
  }else if(Array.isArray(p.v)){
    v=p.v;
    variantRows=p.v.map(n=>({name:n,delta:0}));
  }else{
    v=['افتراضي'];
    variantRows=[{name:'افتراضي',delta:0}];
  }
  const raw=p.image_url||p.img;
  let img;
  if(raw&&!String(raw).startsWith('data:image/svg')) img=raw;
  else img=p.img;
  return{
    id:p.id,
    n:p.name_ar||p.n,
    em:p.emoji||p.em||'',
    c:slug,
    p:Number(p.base_price!=null?p.base_price:p.p),
    v,
    variantRows,
    img,
    desc: p.description || ''
  };
}

/** سعر الوحدة = الأساس + فرق النوع */
function variantDeltaFor(p, variantName){
  const rows=p.variantRows;
  if(!rows||!rows.length) return 0;
  const r=rows.find(x=>x.name===variantName);
  return r?Number(r.delta)||0:0;
}
function unitPrice(p, variantName){
  return Number(p.p)+variantDeltaFor(p, variantName||((p.v&&p.v[0])||''));
}

function onVariantChange(id){
  const sfx=domId(id);
  const vEl=document.getElementById('vs-'+sfx);
  const p=productById(id);
  const priceEl=document.getElementById('pp-'+sfx);
  const qEl=document.getElementById('pqn-'+sfx);
  if(!p||!vEl||!priceEl)return;
  const qty=Math.max(1,parseInt(qEl&&qEl.textContent,10)||1);
  const u=unitPrice(p,vEl.value);
  priceEl.innerHTML=`${(u*qty).toLocaleString()}<small>د.ع</small>`;
}

async function loadCatalogFromApi(){
  const [cats,prods]=await Promise.all([
    HE.Categories.list(),
    HE.Products.getAll({ limit:500 })
  ]);
  if(cats&&cats.length){
    CATS=[{id:'all',label:'الكل',icon:''},...cats.map(c=>({id:c.slug,label:c.name_ar,icon:''}))];
  }else{
    CATS=EMBEDDED_CATS;
  }
  if(prods&&prods.length){
    PRODUCTS=prods.map(mapDbProductToLocal);
  }else{
    PRODUCTS=EMBEDDED_PRODUCTS;
  }
}

async function bootstrap(){
  if(supabaseOk&&HE.Categories&&HE.Products){
    try{
      await loadCatalogFromApi();
    }catch(e){
      console.warn('فشل تحميل الكatalog من الخادم', e);
      CATS=EMBEDDED_CATS;
      PRODUCTS=EMBEDDED_PRODUCTS;
    }
  }else{
    CATS=EMBEDDED_CATS;
    PRODUCTS=EMBEDDED_PRODUCTS;
  }
  restoreLocalState();
  restoreOrderTracking();
  buildCatStrip();
  buildMobCatsMenu();
  updateBadge();
  await renderPage();
  if(activeOrderTrack&&activeOrderTrack.orderId){
    startOrderTrackingPolling();
    void refreshOrderStatus();
  }
}

async function getRecs(cartIds) {
  if (!cartIds.length) return [];

  const cartProducts = cart.map(item => item.p);
  const cartComponents = new Set();
  let totalCartPrice = 0;
  
  cartProducts.forEach(p => {
    totalCartPrice += p.p;
    const comps = extractComponents(p.desc || p.n);
    comps.forEach(c => cartComponents.add(c));
  });

  const avgPrice = totalCartPrice / cartProducts.length;
  const cartComponentList = Array.from(cartComponents);

  const scored = PRODUCTS.map(p => {
    if (cartIds.includes(p.id)) return null;

    const pComps = extractComponents(p.desc || p.n);
    const intersection = pComps.filter(c => cartComponents.has(c));
    
    // 1. Component Score (Jaccard-like)
    const unionSize = new Set([...cartComponentList, ...pComps]).size;
    let componentScore = unionSize > 0 ? (intersection.length / unionSize) * 80 : 0;
    
    // 2. Category Synergy
    const sameCat = cartProducts.some(cp => cp.c === p.c);
    const catScore = sameCat ? 15 : 0;

    // 3. Price Affinity (Prefer items within 40% price range)
    const priceDiff = Math.abs(p.p - avgPrice) / Math.max(1, avgPrice);
    const priceScore = Math.max(0, 5 * (1 - priceDiff));

    const totalScore = Math.min(100, Math.round(componentScore + catScore + priceScore));

    if (totalScore < 15) return null;

    // Generate Reason
    let reason = "";
    if (intersection.length > 0) {
      reason = `مطابق لذوقك في عطور ${intersection.slice(0, 2).join(' و')}`;
    } else if (sameCat) {
      reason = "من نفس الفئات التي تفضلها";
    } else {
      reason = "نقترح لك تجربة هذا العطر المميز";
    }

    return { p, score: totalScore, reason, shared: intersection };
  }).filter(Boolean);

  return scored.sort((a, b) => b.score - a.score).slice(0, 8);
}

/** Extracts scent components/keywords from text with expanded dictionary */
function extractComponents(text) {
  if (!text) return [];
  const textNorm = text.toLowerCase();
  
  const dict = {
    'خشبية': ['خشب', 'سدر', 'صندل', 'غابات', 'أرز'],
    'شرقية': ['عود', 'بخور', 'لبان', 'توابل', 'زعفران', 'فلفل'],
    'زهرية': ['ورد', 'ياسمين', 'زهور', 'براعم', 'أزهار', 'نرجس', 'سوسن', 'لافندر', 'بنفسج'],
    'حمضيات': ['برتقال', 'ليمون', 'حمضيات', 'برغموت', 'كريب فروت'],
    'مسكية': ['مسك', 'عنبر', 'غزال'],
    'سويت': ['فانيليا', 'كراميل', 'سكر', 'شوكولاتة', 'حلاوة']
  };

  const found = new Set();
  for (const [family, keywords] of Object.entries(dict)) {
    for (const kw of keywords) {
      if (textNorm.includes(kw)) {
        found.add(family); // Group by family for better matching
        break;
      }
    }
  }
  
  return Array.from(found);
}

/* ─── STATE ─── */
let cart=[];
let activeCat='all';
let loggedIn=false, userName='', savedAddr=null;
let currentUser=null;
let checkoutConfirmArmed=false;
const CART_STORAGE_KEY='nazrah_cart_v1';
const ADDR_STORAGE_KEY='nazrah_addr_v1';
const ORDER_TRACK_STORAGE_KEY='nazrah_order_track_v1';
let activeOrderTrack=null;
let orderTrackTimer=null;
let myOrders=[];
let selectedOrderId=null;
const REC_BY_ID=new Map();

function persistLocalState(){
  try{
    const slimCart=cart.map(item=>({id:item.p&&item.p.id,v:item.v,qty:item.qty})).filter(x=>x.id!=null);
    localStorage.setItem(CART_STORAGE_KEY,JSON.stringify(slimCart));
    if(savedAddr) localStorage.setItem(ADDR_STORAGE_KEY,JSON.stringify(savedAddr));
    else localStorage.removeItem(ADDR_STORAGE_KEY);
  }catch(e){ console.warn('local state save failed',e); }
}

function restoreLocalState(){
  try{
    const rawCart=localStorage.getItem(CART_STORAGE_KEY);
    if(rawCart){
      const parsed=JSON.parse(rawCart);
      if(Array.isArray(parsed)){
        cart=parsed.map(item=>{
          const p=productById(item.id);
          if(!p)return null;
          return{
            p,
            v:item.v||((p.v&&p.v[0])||''),
            qty:Math.max(1,parseInt(item.qty,10)||1)
          };
        }).filter(Boolean);
      }
    }
    const rawAddr=localStorage.getItem(ADDR_STORAGE_KEY);
    if(rawAddr){
      const addr=JSON.parse(rawAddr);
      if(addr&&typeof addr==='object'){
        savedAddr=addr;
        const city=addr.city||'مدينتك';
        const area=addr.area||'المنطقة';
        const at=document.getElementById('addrTxt');
        if(at)at.textContent=city+' - '+area;
        const mas=document.getElementById('mobAddrSub');
        if(mas)mas.textContent=city+' — '+area;
      }
    }
  }catch(e){ console.warn('local state restore failed',e); }
}

function disarmCheckout(){ checkoutConfirmArmed=false; }

function statusLabel(st){
  if(st==='pending')   return'يتم التجهيز';
  if(st==='confirmed') return'يتم التجهيز';
  if(st==='shipping')  return'يتم التجهيز';
  if(st==='delivered') return'تم الاستلام';
  if(st==='cancelled') return'ملغى';
  if(st==='ready')     return'يتم التجهيز';
  return'يتم التجهيز';
}
function extractCustomerFromOrder(order){
  const nameCol=order&&order.customer_name?String(order.customer_name).trim():'';
  const phoneCol=order&&order.customer_phone?String(order.customer_phone).trim():'';
  const notes=String((order&&order.notes)||'');
  const nameMatch=notes.match(/الاسم:\s*([^|]+)/);
  const phoneMatch=notes.match(/الهاتف:\s*([^|]+)/);
  return{
    name:nameCol||(nameMatch?String(nameMatch[1]).trim():''),
    phone:phoneCol||(phoneMatch?String(phoneMatch[1]).trim():'')
  };
}
function statusClass(st){
  if(st==='confirmed') return'ready';
  if(st==='delivered') return'delivered';
  if(st==='cancelled') return'cancelled';
  if(st==='shipping')  return'ready';
  return'preparing';
}
function saveOrderTrackingState(){
  try{
    if(activeOrderTrack) localStorage.setItem(ORDER_TRACK_STORAGE_KEY,JSON.stringify(activeOrderTrack));
    else localStorage.removeItem(ORDER_TRACK_STORAGE_KEY);
  }catch(e){ console.warn(e); }
}
function renderOrderTrackingBox(){
  const box=document.getElementById('orderTrackBox');
  if(!box)return;
  if(!activeOrderTrack||!activeOrderTrack.orderId){
    box.classList.remove('on');
    updateOrderQuickBtn();
    return;
  }
  box.classList.add('on');
  const idEl=document.getElementById('orderTrackId');
  const stEl=document.getElementById('orderTrackStatus');
  const metaEl=document.getElementById('orderTrackMeta');
  if(idEl)idEl.textContent='طلب #'+activeOrderTrack.orderId;
  if(stEl){
    stEl.className='order-track-status '+statusClass(activeOrderTrack.status);
    stEl.textContent=statusLabel(activeOrderTrack.status);
  }
  if(metaEl){
    const when=activeOrderTrack.updatedAt?new Date(activeOrderTrack.updatedAt).toLocaleString('ar-IQ'):'الآن';
    metaEl.textContent='آخر تحديث: '+when;
  }
  updateOrderQuickBtn();
}
function restoreOrderTracking(){
  try{
    const raw=localStorage.getItem(ORDER_TRACK_STORAGE_KEY);
    if(raw){
      const parsed=JSON.parse(raw);
      if(parsed&&parsed.orderId)activeOrderTrack=parsed;
    }
  }catch(e){ console.warn(e); }
  renderOrderTrackingBox();
}
function clearOrderTracking(){
  activeOrderTrack=null;
  saveOrderTrackingState();
  if(orderTrackTimer){clearInterval(orderTrackTimer);orderTrackTimer=null;}
  renderOrderTrackingBox();
  closeOrderDetailsModal();
}
async function refreshOrderStatus(){
  if(!activeOrderTrack||!activeOrderTrack.orderId)return;
  if(!supabaseOk||!window.HE||!window.HE.db)return;
  try{
    const { data, error } = await window.HE.db
      .from('orders')
      .select('id, status, updated_at')
      .eq('id', activeOrderTrack.orderId)
      .single();
    if(error||!data)return;
    activeOrderTrack={
      orderId:data.id,
      status:data.status||'pending',
      updatedAt:data.updated_at||new Date().toISOString()
    };
    saveOrderTrackingState();
    renderOrderTrackingBox();
    if(activeOrderTrack.status==='delivered'&&orderTrackTimer){
      clearInterval(orderTrackTimer);
      orderTrackTimer=null;
    }
  }catch(_){}
}
function startOrderTrackingPolling(){
  if(orderTrackTimer){clearInterval(orderTrackTimer);orderTrackTimer=null;}
  if(!activeOrderTrack||!activeOrderTrack.orderId)return;
  orderTrackTimer=setInterval(refreshOrderStatus,12000);
}
function updateOrderQuickBtn(){
  const btn=document.getElementById('orderQuickBtn');
  if(!btn)return;
  btn.style.display='inline-flex';
}
function orderStageMeta(st){
  if(st==='delivered') return {label:'تم التجهيز', cls:'done'};
  if(st==='cancelled') return {label:'ملغي', cls:'cancelled'};
  return {label:'قيد التجهيز', cls:'preparing'};
}
async function loadMyOrders(){
  if(!loggedIn||!currentUser||!supabaseOk||!window.HE||!window.HE.db){
    myOrders=[];
    return;
  }
  const sbDb=window.HE.db;
  const { data:orders, error:oErr } = await sbDb
    .from('orders')
    .select('*')
    .eq('user_id', currentUser.id)
    .order('created_at',{ascending:false})
    .limit(30);
  if(oErr) throw oErr;
  const rows=orders||[];
  const ids=rows.map(x=>x.id);
  let countByOrderId=new Map();
  if(ids.length){
    const { data:its, error:iErr } = await sbDb
      .from('order_items')
      .select('order_id,quantity')
      .in('order_id', ids);
    if(iErr) throw iErr;
    (its||[]).forEach(it=>{
      const old=countByOrderId.get(it.order_id)||0;
      countByOrderId.set(it.order_id, old+(Number(it.quantity)||0));
    });
  }
  myOrders=rows.map(o=>({...o,itemCount:countByOrderId.get(o.id)||0}));
}
function renderOrdersSidebar(){
  const body=document.getElementById('ordersDrawerBody');
  if(!body)return;
  if(!loggedIn){
    body.innerHTML='<div class="empty-state"><div class="big"></div><p>سجّل الدخول لعرض طلباتك</p></div>';
    return;
  }
  if(!myOrders.length){
    body.innerHTML='<div class="empty-state"><div class="big"></div><p>لا توجد طلبات حتى الآن</p></div>';
    return;
  }
  body.innerHTML=`<div class="order-list">${
    myOrders.map(o=>{
      const stage=orderStageMeta(o.status);
      const when=o.created_at?new Date(o.created_at).toLocaleString('ar-IQ'):'—';
      const customer=extractCustomerFromOrder(o);
      return `
      <div class="order-mini-card" onclick="openOrderDetailsModal('${o.id}')">
        <div class="order-mini-top">
          <div class="order-mini-id">طلب #${o.order_number||String(o.id).slice(0,8).toUpperCase()}</div>
          <div class="order-mini-time">${when}</div>
        </div>
        <div class="order-mini-meta">
          <div class="order-mini-count">عدد المنتجات: ${o.itemCount||0}</div>
          <span class="order-state-chip ${stage.cls}">${stage.label}</span>
        </div>
        <div class="order-mini-time" style="margin-top:.35rem">الاسم: ${customer.name||'—'} • الهاتف: ${customer.phone||'—'}</div>
      </div>`;
    }).join('')
  }</div>`;
}
async function openOrdersSidebar(){
  if(!loggedIn){
    openLogin();
    toast('سجّل دخولك أولاً');
    return;
  }
  const ov=document.getElementById('ordOv');
  const dr=document.getElementById('ordersDrawer');
  if(ov)ov.classList.add('on');
  if(dr)dr.classList.add('on');
  const body=document.getElementById('ordersDrawerBody');
  if(body)body.innerHTML='<div class="empty-state"><div class="big"></div><p>جاري تحميل طلباتك...</p></div>';
  try{
    await loadMyOrders();
    renderOrdersSidebar();
  }catch(e){
    if(body)body.innerHTML='<div class="empty-state"><div class="big"></div><p>تعذر تحميل الطلبات: '+(e&&e.message?e.message:'خطأ غير معروف')+'</p></div>';
  }
}
function closeOrdersSidebar(){
  const ov=document.getElementById('ordOv');
  const dr=document.getElementById('ordersDrawer');
  if(ov)ov.classList.remove('on');
  if(dr)dr.classList.remove('on');
}
function closeOrderDetailsModal(){
  const m=document.getElementById('orderDetailsMod');
  if(m)m.classList.remove('on');
}
async function openOrderDetailsModal(orderId){
  const targetOrderId=orderId||selectedOrderId||(activeOrderTrack&&activeOrderTrack.orderId);
  if(!targetOrderId){
    toast('لا يوجد طلب نشط حالياً');
    return;
  }
  selectedOrderId=targetOrderId;
  const m=document.getElementById('orderDetailsMod');
  const body=document.getElementById('orderDetailsBody');
  const btnCancel=document.getElementById('btnCancelMyOrder');
  if(m)m.classList.add('on');
  if(body)body.innerHTML='جاري تحميل تفاصيل الطلب...';
  if(btnCancel)btnCancel.disabled=true;

  if(!supabaseOk||!window.HE||!window.HE.db){
    if(body)body.innerHTML='تعذر الاتصال بقاعدة البيانات.';
    return;
  }
  const sbDb=window.HE.db;
  try{
    const { data:ord, error:ordErr } = await sbDb
      .from('orders')
      .select('*')
      .eq('id', targetOrderId)
      .single();
    if(ordErr||!ord) throw ordErr||new Error('الطلب غير موجود');

    const { data:items, error:itErr } = await sbDb
      .from('order_items')
      .select('product_name,variant_name,quantity,unit_price')
      .eq('order_id', ord.id);
    if(itErr) throw itErr;

    const rows=(items||[]).map(it=>`
      <div style="display:grid;grid-template-columns:1.5fr 1fr .7fr 1fr;gap:.45rem;padding:.38rem 0;border-bottom:1px dashed var(--line)">
        <span>${it.product_name||'—'}</span>
        <span style="color:var(--ink3)">${it.variant_name||'افتراضي'}</span>
        <span style="text-align:center">×${it.quantity||0}</span>
        <span style="text-align:left;color:var(--emerald)">${(Number(it.unit_price||0)*Number(it.quantity||0)).toLocaleString()} د.ع</span>
      </div>
    `).join('');

    const address=[ord.delivery_city,ord.delivery_district,ord.delivery_street].filter(Boolean).join('، ')||'—';
    const customer=extractCustomerFromOrder(ord);
    if(body) body.innerHTML=`
      <div style="display:grid;gap:.4rem;margin-bottom:.6rem">
        <div><strong>رقم الطلب:</strong> ${ord.order_number||ord.id}</div>
        <div><strong>الحالة:</strong> ${statusLabel(ord.status)}</div>
        <div><strong>الاسم:</strong> ${customer.name||'—'}</div>
        <div><strong>الهاتف:</strong> ${customer.phone||'—'}</div>
        <div><strong>العنوان:</strong> ${address}</div>
        <div><strong>ملاحظة التوصيل:</strong> ${ord.delivery_notes||'—'}</div>
        <div><strong>تاريخ الطلب:</strong> ${ord.created_at?new Date(ord.created_at).toLocaleString('ar-IQ'):'—'}</div>
      </div>
      <div style="font-weight:800;color:var(--ink);margin:.55rem 0 .2rem">قسم المشتريات</div>
      <div style="display:grid;grid-template-columns:1.5fr 1fr .7fr 1fr;gap:.45rem;color:var(--ink3);font-size:.8rem;padding:.2rem 0 .35rem;border-bottom:1px solid var(--line)">
        <span>المنتج</span><span>النوع</span><span style="text-align:center">العدد</span><span style="text-align:left">السعر</span>
      </div>
      ${rows||'<div style="padding:.6rem 0;color:var(--ink3)">لا توجد عناصر مشتريات.</div>'}
      <div style="margin-top:.7rem"><strong>الإجمالي:</strong> ${(Number(ord.total)||0).toLocaleString()} د.ع</div>
    `;

    if(btnCancel){
      const canCancel=!['delivered','cancelled'].includes(ord.status);
      btnCancel.disabled=!canCancel;
      btnCancel.textContent=canCancel?'إلغاء الطلب':'لا يمكن إلغاء هذا الطلب';
    }
  }catch(e){
    if(body)body.innerHTML='تعذر جلب تفاصيل الطلب: '+(e&&e.message?e.message:'خطأ غير معروف');
    if(btnCancel)btnCancel.disabled=true;
  }
}
async function cancelMyOrder(){
  const targetOrderId=selectedOrderId||(activeOrderTrack&&activeOrderTrack.orderId);
  if(!targetOrderId)return;
  if(!supabaseOk||!window.HE||!window.HE.db)return;
  if(!confirm('هل تريد إلغاء الطلب؟'))return;
  const sbDb=window.HE.db;
  const { error } = await sbDb
    .from('orders')
    .update({status:'cancelled',updated_at:new Date().toISOString()})
    .eq('id', targetOrderId);
  if(error){
    toast('تعذر إلغاء الطلب: '+error.message);
    return;
  }
  if(activeOrderTrack&&String(activeOrderTrack.orderId)===String(targetOrderId)){
    activeOrderTrack.status='cancelled';
    activeOrderTrack.updatedAt=new Date().toISOString();
  }
  myOrders=myOrders.map(o=>String(o.id)===String(targetOrderId)?({...o,status:'cancelled',updated_at:new Date().toISOString()}):o);
  saveOrderTrackingState();
  renderOrderTrackingBox();
  renderOrdersSidebar();
  toast('تم إلغاء الطلب');
  void openOrderDetailsModal(targetOrderId);
}

/* ─── BUILD CAT STRIP ─── */
function buildCatStrip(){
  const strip=document.getElementById('catStrip');
  strip.innerHTML='';
  CATS.forEach(c=>{
    const btn=document.createElement('button');
    btn.type='button';
    btn.className='cat-pill'+(c.id===activeCat?' active':'');
    btn.innerHTML=`<span class="cicon">${c.icon||''}</span>${c.label}`;
    btn.onclick=()=>{void onCategoryTap(c.id);};
    strip.appendChild(btn);
  });
}

async function onCategoryTap(id){
  const targetId = String(id);
  const currentId = String(activeCat);

  if (currentId === targetId) {
    const sec = document.getElementById('sec-' + domId(targetId));
    if (sec) {
      sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    return;
  }

  // If we are showing 'all', we just scroll to the section
  if (currentId === 'all') {
    const sec = document.getElementById('sec-' + domId(targetId));
    if (sec) {
      sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
  }

  // Otherwise, we perform a filter
  await filterCat(targetId, true);
}

function initCatStripScroll(){
  const strip=document.getElementById('catStrip');
  if(!strip||strip.dataset.scrollReady==='1')return;
  strip.dataset.scrollReady='1';

  let drag=null;
  const threshold=8;

  strip.addEventListener('pointerdown',(e)=>{
    if(e.pointerType!=='mouse')return;
    if(e.button!==0)return;
    drag={
      startX:e.clientX,
      startY:e.clientY,
      startLeft:strip.scrollLeft,
      locked:false
    };
    strip.classList.add('dragging');
  }, { passive: true });

  const endDrag=()=>{
    drag=null;
    strip.classList.remove('dragging');
  };

  window.addEventListener('pointerup',endDrag, { passive: true });
  window.addEventListener('pointercancel',endDrag, { passive: true });
  window.addEventListener('pointermove',(e)=>{
    if(!drag)return;
    const dx=e.clientX-drag.startX;
    const dy=e.clientY-drag.startY;

    if(!drag.locked){
      if(Math.abs(dy)>Math.abs(dx)&&Math.abs(dy)>threshold){
        endDrag();
        return;
      }
      if(Math.abs(dx)>threshold){
        drag.locked=true;
      }
    }

    if(drag.locked){
      strip.scrollLeft=drag.startLeft-dx;
    }
  }, { passive: true });
  // Make mouse wheel move the strip horizontally on desktop.
  strip.addEventListener('wheel',(e)=>{
    if(Math.abs(e.deltaY)<=Math.abs(e.deltaX))return;
    strip.scrollLeft+=e.deltaY;
    e.preventDefault();
  },{passive:false});
}

function initCatStripAutoHide(){
  const wrap=document.querySelector('.cat-strip-wrap');
  if(!wrap)return;
  let lastY=window.scrollY||0;
  let ticking=false;
  const NAV_SAFE_TOP=90;
  const MIN_DELTA=6;
  window.addEventListener('scroll',()=>{
    if(ticking)return;
    ticking=true;
    requestAnimationFrame(()=>{
      const y=window.scrollY||0;
      const d=y-lastY;
      if(y<=NAV_SAFE_TOP){
        wrap.classList.remove('hidden-by-scroll');
      }else if(d>MIN_DELTA){
        wrap.classList.add('hidden-by-scroll');   // scrolling down
      }else if(d<-MIN_DELTA){
        wrap.classList.remove('hidden-by-scroll'); // scrolling up
      }
      lastY=y;
      ticking=false;
    });
  },{passive:true});
}

function initProductsDragScroll(){
  let drag=null;
  let suppressClickUntil=0;
  let suppressScopeEl=null;

  const endDrag=()=>{
    if(!drag)return;
    if(drag.moved&&drag.maxDx>(drag.threshold+8)){
      suppressClickUntil=Date.now()+180;
      suppressScopeEl=drag.el;
    }else{
      suppressScopeEl=null;
    }
    drag.el.classList.remove('dragging');
    drag=null;
  };

  document.addEventListener('pointerdown',(e)=>{
    const hs=e.target&&e.target.closest?e.target.closest('.hslider'):null;
    if(!hs)return;
    if(e.target.closest('button,select,input,textarea,label,a'))return;
    if(e.pointerType!=='mouse')return;
    if(e.button!==0)return;

    const moveThreshold=e.pointerType==='touch'?20:10;
    drag={
      el:hs,
      startX:e.clientX,
      startY:e.clientY,
      startLeft:hs.scrollLeft,
      moved:false,
      locked:false,
      pointerId:e.pointerId,
      lastX:e.clientX,
      lastT:performance.now(),
      velocity:0,
      threshold:moveThreshold,
      maxDx:0
    };
  }, { passive: true });

  window.addEventListener('pointermove',(e)=>{
    if(!drag)return;
    const dx=e.clientX-drag.startX;
    const dy=e.clientY-drag.startY;
    const adx=Math.abs(dx);
    const ady=Math.abs(dy);

    if(!drag.locked){
      if(ady>adx&&ady>drag.threshold){
        drag=null;
        return;
      }
      if(adx>drag.threshold){
        drag.locked=true;
        drag.moved=true;
        drag.el.classList.add('dragging');
        try{drag.el.setPointerCapture(drag.pointerId);}catch(_){}
      }
    }

    if(drag.locked){
      if(adx>drag.maxDx)drag.maxDx=adx;
      drag.el.scrollLeft=drag.startLeft-dx;
      
      const now=performance.now();
      const dt=Math.max(1,now-drag.lastT);
      const vx=(e.clientX-drag.lastX)/dt;
      drag.velocity=drag.velocity*0.72+vx*0.28;
      drag.lastX=e.clientX;
      drag.lastT=now;
    }
  }, { passive: true });

  window.addEventListener('pointerup',endDrag, { passive: true });
  window.addEventListener('pointercancel',endDrag, { passive: true });

  document.addEventListener('click',(e)=>{
    if(Date.now()>suppressClickUntil)return;
    if(e.target&&e.target.closest&&e.target.closest('.rcard'))return;
    const hs=e.target&&e.target.closest?e.target.closest('.hslider'):null;
    if(hs&&(!suppressScopeEl||hs===suppressScopeEl)){
      e.preventDefault();
      e.stopPropagation();
    }
  },true);
}

/* ─── BUILD SECTIONS ─── */
async function renderPage(){
  /* update cat strip */
  document.querySelectorAll('.cat-pill').forEach((el,i)=>{
    el.classList.toggle('active',CATS[i].id===activeCat);
  });

  const zone=document.getElementById('sectionsZone');
  zone.innerHTML='';

  const catsToShow = activeCat==='all'
    ? CATS.filter(c=>c.id!=='all')
    : CATS.filter(c=>c.id===activeCat);

  catsToShow.forEach(cat=>{
    const items=PRODUCTS.filter(p=>p.c===cat.id);
    if(!items.length)return;

    const sec=document.createElement('div');
    sec.className='sec';
    sec.innerHTML=`
      <div class="sec-head">
        <div class="sec-title">
          <div class="ico">${cat.icon}</div>
          ${cat.label}
        </div>
        <button type="button" class="sec-see" onclick='filterCat(${JSON.stringify(cat.id)},true)'>عرض الكل</button>
      </div>
      <div class="hslider-wrap">
        <button class="hslider-btn next" onclick="slide('${cat.id}','next')">‹</button>
        <div class="hslider" id="hs-${cat.id}"></div>
        <button class="hslider-btn prev" onclick="slide('${cat.id}','prev')">›</button>
      </div>
    `;
    sec.id='sec-'+domId(cat.id);
    zone.appendChild(sec);

    const hs=sec.querySelector('.hslider');
    items.forEach((p,i)=>{
      hs.appendChild(makeCard(p,i));
    });
  });

  await renderRecs();
  observeProductCards();
}

let productCardsObserver=null;
function observeProductCards(){
  if(productCardsObserver) productCardsObserver.disconnect();
  productCardsObserver=new IntersectionObserver((entries)=>{
    entries.forEach((entry)=>{
      if(entry.isIntersecting){
        const el=entry.target;
        const idx=Number(el.dataset.revealIndex||0);
        setTimeout(()=>el.classList.add('in-view'),idx*45);
        productCardsObserver.unobserve(el);
      }
    });
  },{threshold:.12,rootMargin:'0px 0px -8% 0px'});
  const cards=[...document.querySelectorAll('.pcard')];
  cards.forEach((card,i)=>{
    card.dataset.revealIndex=String(i%10);
    productCardsObserver.observe(card);
  });
}

function typeText(el,text,speed=34){
  return new Promise((resolve)=>{
    if(!el){resolve();return;}
    el.textContent='';
    let i=0;
    const timer=setInterval(()=>{
      i++;
      el.textContent=text.slice(0,i);
      if(i>=text.length){
        clearInterval(timer);
        resolve();
      }
    },speed);
  });
}

async function initHeroTyping(){
  const title=document.getElementById('heroTitle');
  const lead=document.getElementById('heroLead');
  if(!title||!lead) return;
  title.textContent='';
  lead.textContent='';
  await typeText(title,'تسوّق أفضل',42);
  const br=document.createElement('br');
  const em=document.createElement('em');
  em.textContent='العطور العالمية';
  title.appendChild(br);
  title.appendChild(em);
  lead.textContent='تقسيمات لكل للعطور ، توصيل سريع لباب بيتك بأسعار لا تُنافَس.';
}

async function filterCat(id, forceScrollSection=false){
  if(!id)return;
  if(!CATS.some(c=>c.id===id)&&id!=='all')return;
  activeCat=id;
  document.querySelectorAll('.cat-pill').forEach((el,i)=>{
    el.classList.toggle('active',!!CATS[i]&&CATS[i].id===id);
  });
  
  await renderPage();
  
  if (forceScrollSection) {
    requestAnimationFrame(() => {
      const targetSec = document.getElementById('sec-' + domId(id));
      if (targetSec) {
        targetSec.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        const pageEl = document.querySelector('.page');
        if (pageEl) {
           window.scrollTo({ top: pageEl.offsetTop - 110, behavior: 'smooth' });
        }
      }
    });
  }
}

function slide(catId,dir){
  const hs=document.getElementById('hs-'+catId);
  const amount=hs.clientWidth*.75;
  hs.scrollBy({left:dir==='next'?amount:-amount,behavior:'smooth'});
}

/* ─── PRODUCT CARD ─── */
function escAttr(s){
  return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
}
function makeCard(p,delay=0){
  if(!p.variantRows) p.variantRows=(p.v||[]).map(n=>({name:n,delta:0}));
  const pid=JSON.stringify(p.id);
  const sfx=domId(p.id);
  const inCart=cart.find(c=>String(c.p.id)===String(p.id));
  const qty=inCart?inCart.qty:1;
  const selVar=inCart?inCart.v:(p.v&&p.v[0])||'';
  const card=document.createElement('div');
  card.className='pcard'+(inCart?' in-cart':'');
  card.id='pc-'+sfx;
  card.style.animationDelay=delay*0.05+'s';
  const mediaInner=p.img
    ? `<img class="pcard-img" src="${escAttr(p.img)}" alt="${escAttr(p.n)}" loading="lazy">`
    : `<div class="pcard-emoji">${p.em}</div>`;
  const sid='vs-'+sfx;
  const pqnid='pqn-'+sfx;
  const ppid='pp-'+sfx;
  const pbid='pb-'+sfx;
  const opts=p.v.map(vv=>`<option${vv===selVar?' selected':''}>${vv}</option>`).join('');
  const u0=unitPrice(p,selVar||((p.v&&p.v[0])||''));
  card.innerHTML=`
    <div class="pcard-media">${mediaInner}</div>
    <div class="pcard-name">${p.n}</div>
    <div class="pcard-cat">${CATS.find(c=>c.id===p.c)?.label||''}</div>
    <select id="${sid}">${opts}</select>
    <div class="pcard-qty">
      <span class="pcard-qty-label">الكمية</span>
      <div class="pcard-qty-ctrl">
        <button type="button" class="pqbtn" onclick='cardQty(${pid},-1,event)'>−</button>
        <span class="pqnum" id="${pqnid}">${qty}</span>
        <button type="button" class="pqbtn" onclick='cardQty(${pid},1,event)'>+</button>
      </div>
    </div>
    <div class="pcard-foot">
      <div class="pcard-price" id="${ppid}">${(u0*qty).toLocaleString()}<small>د.ع</small></div>
      <button type="button" class="padd-btn${inCart?' done':''}" id="${pbid}" onclick='addItem(${pid},event)'>
        ${inCart?'✓':'+'}
      </button>
    </div>
  `;
  const selEl=card.querySelector('select');
  if(selEl) selEl.addEventListener('change',()=>onVariantChange(p.id));
  return card;
}

/* adjust qty shown on card without adding to cart yet */
function cardQty(id, delta, e){
  e&&e.stopPropagation();
  const sfx=domId(id);
  const numEl=document.getElementById('pqn-'+sfx);
  const priceEl=document.getElementById('pp-'+sfx);
  if(!numEl)return;
  const p=productById(id);
  if(!p)return;
  const vEl=document.getElementById('vs-'+sfx);
  const vname=vEl?vEl.value:((p.v&&p.v[0])||'');
  let cur=parseInt(numEl.textContent,10)||1;
  cur=Math.max(1,cur+delta);
  numEl.textContent=cur;
  const u=unitPrice(p,vname);
  if(priceEl) priceEl.innerHTML=`${(u*cur).toLocaleString()}<small>د.ع</small>`;
}

/* ─── RECOMMENDATIONS ─── */
async function renderRecs() {
  const container = document.getElementById('recZone');
  if (!container) return;
  const ids = cart.map(it => it.p.id);
  const recs = await getRecs(ids);

  if (!recs.length) {
    container.style.display = 'none';
    return;
  }
  container.style.display = 'block';

  container.innerHTML = `
    <div class="rec-head">
      <div class="rec-icon-box">✨</div>
      <div class="rec-head-text">
        <h3>عطور قد تناسب ذوقك</h3>
        <p>بناءً على المكونات العطرية في سلتك</p>
      </div>
    </div>
    <div class="hslider-wrap" style="margin-top:0.4rem">
      <div class="hslider" id="hs-recs" style="padding: 0.5rem 0.2rem 1.4rem">
        ${recs.map(r => {
          const p = r.p;
          const pid = JSON.stringify(p.id);
          const selVar = (p.v && p.v[0]) || '';
          const opts = p.v.map(vv => `<option>${vv}</option>`).join('');
          const price = unitPrice(p, selVar);
          const sfx = domId(p.id);
          
          return `
            <div class="rcard">
              <div class="rcard-match-badge">
                 <div class="match-bar" style="width:${r.score}%"></div>
                 <span>${r.score}% تطابق</span>
              </div>
              <div class="rcard-media">
                ${p.img ? `<img src="${escAttr(p.img)}" class="rcard-img" alt="${escAttr(p.n)}">` : `<div class="rcard-emoji">${p.em}</div>`}
              </div>
              <div class="rcard-info">
                <div class="rcard-name">${p.n}</div>
                <div class="rcard-reason">${r.reason}</div>
                <div class="rcard-price">${price.toLocaleString()} <small>د.ع</small></div>
              </div>
              <select class="rcard-select" id="rvs-${sfx}">
                ${opts}
              </select>
              <button class="rcard-add" onclick='addItem(${pid},event)'>إضافة</button>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

/* ─── CART ACTIONS ─── */
function addItem(id, e){
  e&&e.stopPropagation();
  let p=productById(id);
  if(!p){
    p=REC_BY_ID.get(String(id));
    // Ensure future lookups and cart rendering stay consistent.
    if(p) PRODUCTS.push(p);
  }
  if(!p)return;
  const sfx=domId(id);
  const vEl=document.getElementById('vs-'+sfx);
  const rvEl=document.getElementById('rvs-'+sfx);
  const v=(rvEl&&rvEl.value)?rvEl.value:(vEl?vEl.value:((p.v&&p.v[0])||'افتراضي'));
  /* read qty from the card qty control */
  const qEl=document.getElementById('pqn-'+sfx);
  const selectedQty=qEl?Math.max(1,parseInt(qEl.textContent)||1):1;
  const existing=cart.find(c=>String(c.p.id)===String(id));
  if(existing){
    existing.qty=selectedQty;
    existing.v=v;
  } else {
    cart.push({p,v,qty:selectedQty});
  }
  disarmCheckout();
  persistLocalState();
  updateBadge();
  void renderPage();
  toast(`تمت إضافة المنتج إلى السلة: ${p.n} × ${selectedQty}`);
}

function removeItem(id){
  cart=cart.filter(c=>String(c.p.id)!==String(id));
  disarmCheckout();
  persistLocalState();
  updateBadge();renderCartDrawer();void renderPage();
}

function changeQty(id,d){
  const item=cart.find(c=>String(c.p.id)===String(id));
  if(!item)return;
  item.qty+=d;
  if(item.qty<=0)removeItem(id);
  else{
    disarmCheckout();
    persistLocalState();
    updateBadge();renderCartDrawer();
  }
}

function updateBadge(){
  const n=cart.reduce((s,c)=>s+c.qty,0);
  document.getElementById('cBadge').textContent=n;
  document.getElementById('mobCartBadge').textContent=n;
}

function openCart(){renderCartDrawer();document.getElementById('ov').classList.add('on');document.getElementById('drawer').classList.add('on')}
function closeCart(){document.getElementById('ov').classList.remove('on');document.getElementById('drawer').classList.remove('on')}

function renderCartDrawer(){
  const body=document.getElementById('drawerBody');
  const ft=document.getElementById('drawerFt');
  if(!cart.length){
    body.innerHTML='<div class="empty-state"><div class="big"></div><p>سلتك فارغة</p></div>';
    ft.innerHTML='';return;
  }
  body.innerHTML=cart.map(item=>`
    <div class="citem">
      <div class="citem-media">
        ${item.p.img ? `<img src="${item.p.img}" class="citem-img" alt="${item.p.n}">` : `<span class="citem-em">${item.p.em}</span>`}
      </div>
      <div class="citem-info">
        <div class="citem-name">${item.p.n}</div>
        <div class="citem-var">${item.v}</div>
        <div class="citem-price">${(unitPrice(item.p,item.v)*item.qty).toLocaleString()} د.ع</div>
      </div>
      <div class="qty-row">
        <button type="button" class="qbtn" onclick='changeQty(${JSON.stringify(item.p.id)},-1)'>−</button>
        <span class="qnum">${item.qty}</span>
        <button type="button" class="qbtn" onclick='changeQty(${JSON.stringify(item.p.id)},1)'>+</button>
      </div>
    </div>
  `).join('');

  const sub=cart.reduce((s,c)=>s+unitPrice(c.p,c.v)*c.qty,0);
  const dlv=3000;
  ft.innerHTML=`
    <div class="ft-row"><span>المجموع الفرعي</span><span>${sub.toLocaleString()} د.ع</span></div>
    <div class="ft-row"><span>رسوم التوصيل</span><span>${dlv.toLocaleString()} د.ع</span></div>
    <div class="ft-row total"><span>الإجمالي</span><span>${(sub+dlv).toLocaleString()} د.ع</span></div>
    ${
      checkoutConfirmArmed
      ? '<button class="checkout-btn" style="background:linear-gradient(135deg,#c76b5f,#d68478)" onclick="checkout()">تأكيد الطلب</button><button class="checkout-btn" style="margin-top:.45rem;background:transparent;color:var(--ink);border:1.5px solid var(--line)" onclick="cancelCheckoutConfirm()">إلغاء</button>'
      : '<button class="checkout-btn" onclick="armCheckoutConfirm()">إتمام الطلب</button>'
    }
  `;
}

function armCheckoutConfirm(){
  checkoutConfirmArmed=true;
  renderCartDrawer();
  toast('اضغط "تأكيد الطلب" لإرسال الطلب');
}

function cancelCheckoutConfirm(){
  checkoutConfirmArmed=false;
  renderCartDrawer();
}

async function checkout(){
  if(!loggedIn){
    closeCart();openLogin();toast('سجّل دخولك أولاً');return;
  }
  if(!savedAddr){
    closeCart();openAddr();toast('أضف عنوان التوصيل أولاً');return;
  }
  if(!cart.length){
    toast('سلتك فارغة');
    return;
  }
  if(!checkoutConfirmArmed){
    armCheckoutConfirm();
    return;
  }
  if(!supabaseOk || !window.HE || !window.HE.db){
    toast('خدمة قاعدة البيانات غير متاحة');return;
  }
  const sbDb = window.HE.db;

  const deliveryFee=3000;
  const subtotal=cart.reduce((s,c)=>s+unitPrice(c.p,c.v)*c.qty,0);
  const total=subtotal+deliveryFee;
  const meta=currentUser?.user_metadata||{};
  const customerName=(meta.full_name && String(meta.full_name).trim()) ? String(meta.full_name).trim() : (userName||'مستخدم');
  const customerPhone=(meta.phone && String(meta.phone).trim()) ? String(meta.phone).trim() : '';
  const addressLine=[savedAddr.city,savedAddr.area,savedAddr.street,savedAddr.buildingNo,savedAddr.floor].filter(Boolean).join(' - ');
  const detailsNote=[
    `الاسم: ${customerName||'—'}`,
    `الهاتف: ${customerPhone||'—'}`,
    `العنوان: ${addressLine||'—'}`,
    `ملاحظة العميل: ${savedAddr.notes||'—'}`
  ].join(' | ');

  // هل المعرف UUID؟ (منتجات Supabase تكون UUID، المنتجات المحلية أرقام)
  const isUUID = (v) => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v);

  try{
    toast('جارٍ حفظ الطلب...');

    // ── 1. إنشاء الطلب في جدول orders ──
    // نرسل أقل مجموعة حقول مضمونة غالباً + fallback تلقائي إذا ظهر عمود غير موجود.
    const orderPayload = {
      user_id:           currentUser.id,
      order_number:      'ORD-' + Date.now(),
      status:            'pending',
      delivery_city:     savedAddr.city     || null,
      delivery_district: savedAddr.area     || null,
      delivery_street:   savedAddr.street   || null,
      delivery_notes:    savedAddr.notes    || null,
      customer_name:     customerName || null,
      customer_phone:    customerPhone || null,
      subtotal:          subtotal,
      delivery_fee:      deliveryFee,
      discount_amount:   0,
      total:             total,
      payment_method:    'cash',
      notes:             detailsNote
    };

    const tryInsertOrder = async (payload) => {
      // نكتفي بجلب id لتفادي أخطاء select على أعمدة غير موجودة.
      return sbDb.from('orders').insert(payload).select('id').single();
    };
    const removeUnknownColumnAndRetry = async (initialPayload, maxAttempts=6) => {
      const payload = { ...initialPayload };
      for(let attempt=0;attempt<maxAttempts;attempt++){
        const res = await tryInsertOrder(payload);
        if(!res.error) return res;
        const msg = String(res.error.message||'');
        const m = msg.match(/Could not find the '([^']+)' column/i);
        if(!m) return res;
        delete payload[m[1]];
      }
      return { data:null, error:new Error('فشل إدراج الطلب بعد عدة محاولات توافق أعمدة') };
    };

    let orderRes = await removeUnknownColumnAndRetry(orderPayload);

    if(orderRes.error){
      console.error('[orders insert]', orderRes.error);
      throw orderRes.error;
    }

    const order = orderRes.data;
    let orderFull = null;
    try{
      const fullRes = await sbDb.from('orders').select('*').eq('id', order.id).single();
      if(!fullRes.error) orderFull = fullRes.data;
    }catch(_){}

    // ── 2. إضافة عناصر الطلب في جدول order_items ──
    // إذا المنتج ليس UUID (منتج محلي)، نحاول ربطه بمنتج قاعدة البيانات عبر الاسم.
    const unresolvedNames = cart
      .filter(item=>!isUUID(String(item.p.id)))
      .map(item=>String(item.p.n||'').trim())
      .filter(Boolean);
    const productIdByName = new Map();
    if(unresolvedNames.length){
      try{
        const uniqNames=[...new Set(unresolvedNames)];
        const { data: dbProducts, error: mapErr } = await sbDb
          .from('products')
          .select('id,name_ar')
          .in('name_ar', uniqNames);
        if(mapErr) console.warn('[products mapping]', mapErr);
        (dbProducts||[]).forEach(r=>{
          if(r&&r.name_ar&&r.id) productIdByName.set(String(r.name_ar).trim(), r.id);
        });
      }catch(e){ console.warn('[products mapping throw]', e); }
    }

    const orderItems = cart.map(item => {
      let resolvedProductId = null;
      if(isUUID(String(item.p.id))) resolvedProductId = item.p.id;
      else resolvedProductId = productIdByName.get(String(item.p.n||'').trim()) || null;
      const row = {
        order_id:     order.id,
        product_id:   resolvedProductId,
        product_name: item.p.n,
        variant_name: item.v || null,
        quantity:     item.qty,
        unit_price:   unitPrice(item.p, item.v)
      };
      return row;
    });

    const missingProductIds = orderItems.filter(r=>!r.product_id).map(r=>r.product_name);
    if(missingProductIds.length){
      throw new Error('هذه المنتجات غير مربوطة بجدول المنتجات: '+[...new Set(missingProductIds)].join('، '));
    }

    const itemsRes = await sbDb.from('order_items').insert(orderItems);
    if(itemsRes.error){
      console.error('[order_items insert]', itemsRes.error);
      // لا نكمل بدون عناصر الطلب حتى لا يظهر الطلب فارغاً في لوحة الإدارة.
      throw new Error('فشل حفظ عناصر المشتريات: '+(itemsRes.error.message||'خطأ غير معروف'));
    }

    // ── 3. تتبع الطلب ──
    activeOrderTrack ={
      orderId:   order.id,
      status:    (orderFull&&orderFull.status) ? orderFull.status : 'pending',
      updatedAt: new Date().toISOString()
    };
    saveOrderTrackingState();
    renderOrderTrackingBox();
    startOrderTrackingPolling();

    const orderNo=(orderFull&&orderFull.order_number)?orderFull.order_number:('ID-'+String(order.id).slice(0,8).toUpperCase());
    toast('تم تأكيد طلبك. رقم الطلب: ' + orderNo);
    disarmCheckout();
    cart=[];updateBadge();closeCart();void renderPage();
    persistLocalState();

  }catch(e){
    console.error('[checkout error]', e);
    toast('تعذر إتمام العملية: ' + (e.message || 'خطأ في الاتصال بقاعدة البيانات'));
  }
}

/* ─── SEARCH ─── */
function doSearch(q){
  const drop=document.getElementById('sdrop');
  if(!q.trim()){drop.classList.remove('on');return;}
  const res=PRODUCTS.filter(p=>p.n.includes(q)||p.v.some(vv=>vv.includes(q))).slice(0,8);
  if(!res.length){
    drop.innerHTML='<div class="srch-row"><span class="si-emoji" style="font-size:1.2rem;background:none;border:none">🔍</span><div class="srch-row-info"><div class="srch-row-name">لا توجد نتائج</div><div class="srch-row-meta">جرّب كلمة مختلفة</div></div></div>';
    drop.classList.add('on');return;
  }
  drop.innerHTML=res.map(p=>`
    <div class="srch-row" onclick='jumpTo(${JSON.stringify(p.id)})'>
      <span class="si-emoji">${p.em}</span>
      <div class="srch-row-info">
        <div class="srch-row-name">${p.n}</div>
        <div class="srch-row-meta">${CATS.find(c=>c.id===p.c)?.label||''}</div>
      </div>
      <span class="srch-row-price">${p.p.toLocaleString()} د.ع</span>
    </div>
  `).join('');
  drop.classList.add('on');
}
function closeSearch(){document.getElementById('sdrop').classList.remove('on')}

function jumpTo(id){
  const p=productById(id);
  if(!p)return;
  document.getElementById('si').value='';
  closeSearch();
  filterCat(p.c);
  setTimeout(()=>{
    const el=document.getElementById('pc-'+domId(id));
    if(el){el.scrollIntoView({behavior:'smooth',block:'center'});el.style.outline='3px solid var(--emerald)';setTimeout(()=>el.style.outline='',2000);}
  },200);
}

/* ─── AUTH (Supabase) ─── */
function clearAuthMsg(){
  const el=document.getElementById('authMsg');
  if(!el)return;
  el.className='auth-msg';el.textContent='';
}
function setAuthErr(text){
  const el=document.getElementById('authMsg');
  if(!el)return;
  el.className='auth-msg err';
  el.textContent=text;
}
function setBtnLoading(btn, loading, labelBusy, labelIdle){
  if(!btn)return;
  if(loading){
    btn.dataset.idle=btn.dataset.idle||btn.textContent;
    btn.textContent=labelBusy||'جاري المعالجة…';
    btn.disabled=true;
  }else{
    btn.textContent=labelIdle||btn.dataset.idle||btn.textContent;
    btn.disabled=false;
  }
}
function translateAuthError(e){
  if(!e)return'حدث خطأ غير متوقع';
  const code=(e.code||'').toLowerCase();
  const msg=(e.message||'').toLowerCase();
  if(code==='no_api'||msg.includes('no api'))return'تعذّر الاتصال بالخادم. تأكد من تحميل supabase-api.js';
  if(code==='invalid_credentials'||msg.includes('invalid login'))return'البريد الإلكتروني أو كلمة المرور غير صحيحة';
  if(code==='email_not_confirmed'||msg.includes('email not confirmed'))
    return'البريد غير مؤكَّد بعد. استخدم نافذة «تأكيد بريدك» لإعادة إرسال الرسالة.';
  if(code==='user_already_registered'||msg.includes('already registered'))return'هذا البريد مسجّل مسبقاً. جرّب تسجيل الدخول';
  if(code==='weak_password')return'كلمة المرور ضعيفة. استخدم ٦ أحرف على الأقل';
  if(code==='invalid_email'||msg.includes('invalid email'))return'صيغة البريد الإلكتروني غير صالحة';
  if(msg.includes('rate limit')||code.includes('over_request')||code==='over_email_send_rate_limit')
    return'محاولات أو رسائل كثيرة. انتظر بضع دقائق ثم أعد المحاولة';
  return e.message||'تعذّر إكمال العملية';
}
function isEmailNotConfirmed(e){
  const c=(e&&e.code||'').toLowerCase();
  const m=(e&&e.message||'').toLowerCase();
  return c==='email_not_confirmed'||m.includes('email not confirmed');
}
let pendingVerifyEmail='';
let verifyResendUntil=0;
let verifyResendTimer=null;
const VERIFY_RESEND_COOLDOWN_SEC=60;
function getAuthCallbackUrl(){
  return`${window.location.origin}${window.location.pathname}${window.location.search||''}`;
}
function openVerifyPending(email){
  pendingVerifyEmail=(email||'').trim();
  const disp=document.getElementById('verifyEmailDisplay');
  if(disp)disp.textContent=pendingVerifyEmail||'—';
  const ru=document.getElementById('verifyRedirectUrl');
  if(ru)ru.textContent=getAuthCallbackUrl();
  document.getElementById('verifyMod').classList.add('on');
  startVerifyCooldown(VERIFY_RESEND_COOLDOWN_SEC);
}
function closeVerifyModal(){
  const m=document.getElementById('verifyMod');
  if(m)m.classList.remove('on');
  if(verifyResendTimer){clearInterval(verifyResendTimer);verifyResendTimer=null;}
  verifyResendUntil=0;
  const btn=document.getElementById('btnResendVerify');
  if(btn){btn.disabled=false;btn.textContent='إعادة إرسال رسالة التأكيد';}
}
function updateResendBtn(){
  const btn=document.getElementById('btnResendVerify');
  if(!btn)return;
  const left=Math.ceil((verifyResendUntil-Date.now())/1000);
  if(left>0){btn.disabled=true;btn.textContent='يمكنك الإعادة خلال '+left+' ث';}
  else{btn.disabled=false;btn.textContent='إعادة إرسال رسالة التأكيد';}
}
function startVerifyCooldown(sec){
  if(verifyResendTimer)clearInterval(verifyResendTimer);
  verifyResendUntil=Date.now()+sec*1000;
  updateResendBtn();
  verifyResendTimer=setInterval(()=>{
    updateResendBtn();
    if(Date.now()>=verifyResendUntil&&verifyResendTimer){
      clearInterval(verifyResendTimer);
      verifyResendTimer=null;
      updateResendBtn();
    }
  },400);
}
async function resendVerification(){
  if(!pendingVerifyEmail){toast('لا يوجد بريد لإعادة الإرسال');return;}
  if(!supabaseOk){toast(translateAuthError({code:'no_api'}));return;}
  const left=Math.ceil((verifyResendUntil-Date.now())/1000);
  if(left>0)return;
  const btn=document.getElementById('btnResendVerify');
  setBtnLoading(btn,true,'جاري الإرسال…');
  try{
    await HE.Auth.resendSignupEmail(pendingVerifyEmail);
    toast('تم إرسال رسالة جديدة. راجع البريد ومجلد غير المرغوب');
    startVerifyCooldown(VERIFY_RESEND_COOLDOWN_SEC);
  }catch(e){
    toast(translateAuthError(e));
  }finally{
    setBtnLoading(btn,false,null,'إعادة إرسال رسالة التأكيد');
    updateResendBtn();
  }
}
function switchToLoginFromVerify(){
  const em=pendingVerifyEmail;
  closeVerifyModal();
  openLogin();
  const le=document.getElementById('logEmail');
  if(le&&em)le.value=em;
  const t0=document.querySelector('#loginMod .tab');
  if(t0)swtTab('in',t0);
}
function openVerifyFromLogin(){
  const email=document.getElementById('logEmail').value.trim();
  if(!email){setAuthErr('أدخل بريدك في الحقل أعلاه ثم اضغط هنا مجدداً');return;}
  closeLogin();
  openVerifyPending(email);
}
function deriveDisplayName(user){
  if(!user)return'';
  const m=user.user_metadata||{};
  if(m.full_name&&String(m.full_name).trim())return String(m.full_name).trim();
  if(user.email)return user.email.split('@')[0];
  return'مستخدم';
}
function applyAuthUser(user, authEvent){
  currentUser=user;
  loggedIn=!!user;
  userName=user?deriveDisplayName(user):'';
  if(!user&&authEvent==='SIGNED_OUT'){ /* keep local address/cart by request */ }
  syncAuthUI();
  if(user)closeVerifyModal();
}
function syncAuthUI(){
  const guest=document.getElementById('navGuestBtn');
  const wrap=document.getElementById('navUserWrap');
  const nameEl=document.getElementById('userNavName');
  if(guest)guest.style.display=loggedIn?'none':'flex';
  if(wrap)wrap.style.display=loggedIn?'flex':'none';
  if(nameEl)nameEl.textContent=userName||'—';
  const navBtn=document.getElementById('navUserBtn');
  if(navBtn)navBtn.title=loggedIn?('مرحباً، '+userName):'';
  const mobT=document.getElementById('mobLoginTitle');
  const mobS=document.getElementById('mobLoginSub');
  if(mobT)mobT.textContent=loggedIn?('مرحباً، '+userName):'تسجيل الدخول';
  if(mobS)mobS.textContent=loggedIn?'نتمنى لك تسوّقاً ممتعاً — اضغط للخروج':'ادخل أو أنشئ حساباً جديداً';
  closeUserMenu();
}
function toggleUserMenu(ev){
  ev&&ev.stopPropagation();
  const menu=document.getElementById('navUserMenu');
  if(!menu)return;
  menu.classList.toggle('open');
}
function closeUserMenu(){
  const menu=document.getElementById('navUserMenu');
  if(menu)menu.classList.remove('open');
}
function menuLogout(){
  closeUserMenu();
  doLogout();
}
document.addEventListener('click',(e)=>{
  const wrap=document.getElementById('navUserWrap');
  if(wrap&&wrap.contains(e.target))return;
  closeUserMenu();
});
function onMobAccountTap(){
  closeMobSidebar();
  if(loggedIn){
    if(confirm('هل تريد تسجيل الخروج؟'))doLogout();
  }else openLogin();
}
async function doLogin(){
  clearAuthMsg();
  const email=document.getElementById('logEmail').value.trim();
  const password=document.getElementById('logPass').value;
  if(!email||!password){setAuthErr('أدخل البريد الإلكتروني وكلمة المرور');return;}
  if(!supabaseOk){setAuthErr(translateAuthError({code:'no_api'}));return;}
  const btn=document.getElementById('btnLoginSubmit');
  setBtnLoading(btn,true,'جاري الدخول…');
  try{
    await HE.Auth.login({email,password});
    closeLogin();
    toast('مرحباً بك');
  }catch(e){
    if(isEmailNotConfirmed(e)){
      closeLogin();
      openVerifyPending(email);
      return;
    }
    setAuthErr(translateAuthError(e));
  }finally{
    setBtnLoading(btn,false,null,'تسجيل الدخول');
  }
}
async function doRegister(){
  clearAuthMsg();
  const fn=document.getElementById('regFname').value.trim();
  const ln=document.getElementById('regLname').value.trim();
  const phone=document.getElementById('regPhone').value.trim();
  const email=document.getElementById('regEmail').value.trim();
  const password=document.getElementById('regPass').value;
  if(!email||!password){setAuthErr('البريد وكلمة المرور مطلوبان');return;}
  if(password.length<6){setAuthErr('كلمة المرور يجب أن تكون ٦ أحرف على الأقل');return;}
  if(!supabaseOk){setAuthErr(translateAuthError({code:'no_api'}));return;}
  const fullName=[fn,ln].filter(Boolean).join(' ').trim()||(email.split('@')[0]);
  const btn=document.getElementById('btnRegSubmit');
  setBtnLoading(btn,true,'جاري إنشاء الحساب…');
  try{
    const data=await HE.Auth.register({email,password,fullName,phone:phone||undefined});
    closeLogin();
    if(data&&data.session){
      toast('تم إنشاء الحساب وتسجيل الدخول');
    }else{
      openVerifyPending(email);
      toast('راجع بريدك أو استخدم إعادة الإرسال من النافذة');
    }
  }catch(e){
    setAuthErr(translateAuthError(e));
  }finally{
    setBtnLoading(btn,false,null,'إنشاء الحساب');
  }
}
async function forgotPassword(){
  clearAuthMsg();
  const email=document.getElementById('logEmail').value.trim();
  if(!email){setAuthErr('أدخل بريدك أعلاه ثم اضغط «نسيت كلمة المرور»');return;}
  if(!supabaseOk){setAuthErr(translateAuthError({code:'no_api'}));return;}
  try{
    await HE.Auth.resetPassword(email);
    toast('إن وُجد حساب لذلك البريد، ستصلك تعليمات إعادة التعيين');
  }catch(e){
    setAuthErr(translateAuthError(e));
  }
}
async function doLogout(){
  try{
    if(supabaseOk)await HE.Auth.logout();
    else{
      applyAuthUser(null,'SIGNED_OUT');
      toast('تم تسجيل الخروج');
    }
  }catch(e){
    toast(translateAuthError(e));
    return;
  }
}
function openLogin(){
  closeVerifyModal();
  clearAuthMsg();
  document.getElementById('loginMod').classList.add('on');
}
function closeLogin(){document.getElementById('loginMod').classList.remove('on')}
function swtTab(t,btn){
  clearAuthMsg();
  document.querySelectorAll('.tab').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('tabIn').style.display=t==='in'?'block':'none';
  document.getElementById('tabUp').style.display=t==='up'?'block':'none';
}

/* ─── ADDRESS ─── */
function openAddr(){document.getElementById('addrMod').classList.add('on')}
function closeAddr(){document.getElementById('addrMod').classList.remove('on')}
function saveAddr(){
  const city=document.getElementById('cityS').value;
  const area=document.getElementById('areaI').value||'المنطقة';
  const street=document.getElementById('strtI').value||'';
  const buildingNo=document.getElementById('bldNoI')?.value||'';
  const floor=document.getElementById('floorI')?.value||'';
  const notes=document.getElementById('notesTa')?.value||'';
  savedAddr={city,area,street,buildingNo,floor,notes};
  persistLocalState();
  document.getElementById('addrTxt').textContent=city+' - '+area;
  document.getElementById('mobAddrSub').textContent=city+' — '+area;
  closeAddr();
  toast('تم حفظ العنوان: '+city);
}

/* ─── MOBILE SIDEBAR ─── */
function toggleMobSidebar(){
  const sb=document.getElementById('mobSb');
  const ov=document.getElementById('mobOv');
  const btn=document.getElementById('menuBtn');
  const isOpen=sb.classList.contains('on');
  if(isOpen){closeMobSidebar();}
  else{
    sb.classList.add('on');ov.classList.add('on');btn.classList.add('open');
    document.body.style.overflow='hidden';
  }
}
function closeMobSidebar(){
  document.getElementById('mobSb').classList.remove('on');
  document.getElementById('mobOv').classList.remove('on');
  document.getElementById('menuBtn').classList.remove('open');
  document.body.style.overflow='';
}

function buildMobCatsMenu(){
  const wrap=document.getElementById('mobCatsMenu');
  if(!wrap)return;
  CATS.filter(c=>c.id!=='all').forEach(cat=>{
    const btn=document.createElement('button');
    btn.className='mob-sb-item';
    btn.style.marginBottom='.3rem';
    btn.innerHTML=`<div class="si-icon green" style="width:34px;height:34px;border-radius:9px;font-size:1rem">${cat.icon}</div><div class="si-text"><div class="si-title" style="font-size:.88rem">${cat.label}</div></div>`;
    btn.onclick=()=>{closeMobSidebar();void onCategoryTap(cat.id)};
    wrap.appendChild(btn);
  });
}

/* ─── TOAST ─── */
let toastTimer;
function toast(msg){
  const t=document.getElementById('toast');
  t.textContent=msg;t.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>t.classList.remove('on'),2700);
}
function hidePreloader(){
  const el=document.getElementById('preloader');
  if(!el)return;
  el.classList.add('hide');
  setTimeout(()=>{if(el&&el.parentNode)el.parentNode.removeChild(el);},420);
}

/* ─── INIT ─── */
if(location.protocol==='file:'){
  setTimeout(()=>{
    toast('استخدم Live Server أو رابط http://127.0.0.1 لعمل المصادقة وقاعدة البيانات');
  },600);
}
if(supabaseOk){
  HE.Auth.onAuthChange((event,user)=>{
    applyAuthUser(user,event);
    if(event==='SIGNED_OUT')toast('تم تسجيل الخروج');
  });
  HE.Auth.getCurrentUser()
    .then(user=>applyAuthUser(user,user?'INITIAL_SESSION':'SIGNED_OUT'))
    .catch(()=>syncAuthUI());
}else{
  syncAuthUI();
}
initCatStripScroll();
initCatStripAutoHide();
initProductsDragScroll();
initHeroTyping();
bootstrap()
  .then(()=>hidePreloader())
  .catch((e)=>{
    console.error(e);
    hidePreloader();
    toast('حدث تأخير أثناء التحميل');
  });
window.addEventListener('load',()=>setTimeout(hidePreloader,1200),{once:true});
