import React, { useState, useEffect } from 'react';
import { 
  FolderOpen, 
  Search, 
  Download, 
  CornerDownRight, 
  CheckCircle, 
  AlertCircle,
  Clock,
  FolderDot,
  FileVideo,
  FileImage,
  Box,
  Shuffle,
  X,
  ExternalLink,
  ChevronRight,
  ChevronLeft
} from 'lucide-react';
import { AppId, AppStatus, AppConfig, ArtAsset, AssetCategory, SpaceId, ProjectSpace } from '../types';

interface AssetLibraryProps {
  currentSpace: ProjectSpace;
  apps: AppConfig[];
  assets: ArtAsset[];
  downloadedAssetIds: Set<string>;
  setDownloadedAssetIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  simulatedDiskGB: number;
  setSimulatedDiskGB: React.Dispatch<React.SetStateAction<number>>;
  addLog: (text: string, type: 'info' | 'success' | 'warning' | 'error') => void;
}

// Simulated active download task structure for queue management
interface ActiveDownload {
  assetId: string;
  progress: number;
  status: 'downloading' | 'queued';
  targetDccImportAfterDownload?: AppId; // If triggered by import click, remembers DCC target
}

export default function AssetLibrary({
  currentSpace,
  apps,
  assets,
  downloadedAssetIds,
  setDownloadedAssetIds,
  simulatedDiskGB,
  setSimulatedDiskGB,
  addLog
}: AssetLibraryProps) {
  // Navigation & filter states
  const [selectedCat, setSelectedCat] = useState<AssetCategory>(AssetCategory.All);
  const [keyword, setKeyword] = useState<string>('');
  const [selectedAsset, setSelectedAsset] = useState<ArtAsset | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [showAssetCardInfo, setShowAssetCardInfo] = useState<boolean>(true);

  // Reset page when filters or space change
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedCat, keyword, currentSpace]);

  useEffect(() => {
    setSelectedAsset(null);
  }, [currentSpace]);

  useEffect(() => {
    if (!selectedAsset) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSelectedAsset(null);
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [selectedAsset]);

  // Download simulation engine states (queue F9 rule)
  const [activeDownloads, setActiveDownloads] = useState<ActiveDownload[]>([]);
  
  // Custom dialog popups - "可选" mode selections
  const [importOptionsConfig, setImportOptionsConfig] = useState<{ asset: ArtAsset, dccId: AppId } | null>(null);
  const [selectedImportMode, setSelectedImportMode] = useState<string>('');

  const isProjectA = currentSpace.id === SpaceId.ProjectA;

  // Filter categories list matching PRD
  const categoryTabs = [
    { id: AssetCategory.All, name: '全部' },
    { id: AssetCategory.CharConcept, name: '角色原画' },
    { id: AssetCategory.SceneConcept, name: '场景原画' },
    { id: AssetCategory.CharModel, name: '角色模型' },
    { id: AssetCategory.SceneModel, name: '场景模型' },
    { id: AssetCategory.Animation, name: '动画序列' },
    { id: AssetCategory.Video, name: '粒子视频' },
    { id: AssetCategory.GUI, name: 'GUI 切图' },
  ];

  // Queue Concurrency Handler (Max 3 concurrent downloading)
  useEffect(() => {
    const downloadingCount = activeDownloads.filter(d => d.status === 'downloading').length;
    
    // If we have under 3 active, and have queued tasks, promote the first queued task
    if (downloadingCount < 3) {
      const nextQueuedIdx = activeDownloads.findIndex(d => d.status === 'queued');
      if (nextQueuedIdx !== -1) {
        const targetId = activeDownloads[nextQueuedIdx].assetId;
        
        // Promote to downloading status
        setActiveDownloads(prev => prev.map((item, idx) => {
          if (idx === nextQueuedIdx) {
            return { ...item, status: 'downloading' };
          }
          return item;
        }));

        simulateDownloadProgress(targetId);
      }
    }
  }, [activeDownloads]);

  // Download logic worker
  const simulateDownloadProgress = (assetId: string) => {
    const asset = assets.find(a => a.id === assetId);
    if (!asset) return;

    addLog(`📥 (队列启动) 开始下载美术源文件: ${asset.name}...`, 'info');

    let prog = 0;
    const interval = setInterval(() => {
      prog += 10;
      
      setActiveDownloads(prev => {
        const exists = prev.some(d => d.assetId === assetId);
        if (!exists) {
          clearInterval(interval);
          return prev;
        }

        if (prog >= 100) {
          clearInterval(interval);
          
          // Complete download
          setDownloadedAssetIds(prevIds => {
            const nextSet = new Set(prevIds);
            nextSet.add(assetId);
            return nextSet;
          });

          // Subtract disk size (convert MB to GB)
          const fileGB = asset.sizeMB / 1024;
          setSimulatedDiskGB(d => Math.max(0.1, d - fileGB));

          addLog(`✅ 素材 ${asset.name} 下载完毕！本地安全隔离包定位完成。`, 'success');

          // Check if we need to auto trigger DCC import after this download (Path B override)
          const currentTask = prev.find(d => d.assetId === assetId);
          if (currentTask?.targetDccImportAfterDownload) {
            const dccTarget = currentTask.targetDccImportAfterDownload;
            // Delay slightly to look realistic
            setTimeout(() => {
              triggerDirectImport(asset, dccTarget);
            }, 600);
          }

          // Clean up this task
          return prev.filter(d => d.assetId !== assetId);
        } else {
          return prev.map(d => {
            if (d.assetId === assetId) {
              return { ...d, progress: prog };
            }
            return d;
          });
        }
      });
    }, 200);
  };

  // Trigger Local Download Action - F9 Path A
  const handleLocalDownload = (asset: ArtAsset) => {
    if (downloadedAssetIds.has(asset.id)) {
      addLog(`📁 打开本地资源目录，定位文件夹: C:\\Program Files\\ArtPlatform\\downloads\\${asset.id}`, 'info');
      alert(`[定位文件夹]\n已在 Windows 资源管理器中高亮定位到素材目录:\nC:\\Program Files\\ArtPlatform\\downloads\\${asset.id}\\${asset.name}.${asset.format.toLowerCase()}`);
      return;
    }

    // Disk space check
    const requiredGB = asset.sizeMB / 1024;
    if (simulatedDiskGB < requiredGB) {
      addLog(`❌ 下载空间受阻：可用空间不足。下载大小为 ${asset.sizeMB} MB，当前剩余 ${simulatedDiskGB.toFixed(2)} GB。`, 'error');
      alert(`[暂无下载配额]\n无法开始素材下载：硬盘 D: 磁盘空间已达到阻断阀值。\n\n素材所需空间: ${asset.sizeMB} MB (${requiredGB.toFixed(2)} GB)\n当前尚有可用: ${simulatedDiskGB.toFixed(2)} GB\n\n请在“设置”页清理历史临时分发文件，或扩展虚拟模拟配置。`);
      return;
    }

    // Check if copy task is already active
    if (activeDownloads.some(d => d.assetId === asset.id)) {
      return;
    }

    // Push into active tasks
    const downloadingCount = activeDownloads.filter(d => d.status === 'downloading').length;
    const initialStatus = downloadingCount < 3 ? 'downloading' : 'queued';

    setActiveDownloads(prev => [...prev, {
      assetId: asset.id,
      progress: 0,
      status: initialStatus
    }]);

    if (initialStatus === 'queued') {
      addLog(`⏳ (下载队满) 队列负荷中，素材 ${asset.name} 已安全置入第 ${activeDownloads.length - downloadingCount + 1} 位缓冲等候列中...`, 'warning');
    } else {
      simulateDownloadProgress(asset.id);
    }
  };

  // Check compatibility Matrix for Import DCC - F9 Path B
  const checkCompatibility = (format: string, appId: AppId): { compatible: boolean; reason?: string } => {
    const fmt = format.toLowerCase();
    
    // ComfyUI (PNG, JPG, MP4, MOV, Sequence)
    if (appId === AppId.ComfyUI) {
      const allowed = ['png', 'jpg', 'jpeg', 'mp4', 'mov'];
      if (allowed.includes(fmt)) return { compatible: true };
      return { compatible: false, reason: 'ComfyUI 仅支持JPG/PNG图像及MP4/MOV视频输入加载' };
    }

    // Photoshop (PNG, JPG)
    if (appId === AppId.Photoshop) {
      const allowed = ['png', 'jpg', 'jpeg'];
      if (allowed.includes(fmt)) return { compatible: true };
      return { compatible: false, reason: 'Photoshop 仅支持 JPG 和 PNG 经典平面栅格格式置入' };
    }

    // Blender (FBX, OBJ, blend) + flat images (PNG, JPG) for Reference Plane
    if (appId === AppId.Blender) {
      const allowedModels = ['fbx', 'obj', 'blend'];
      const allowedImages = ['png', 'jpg', 'jpeg'];
      if (allowedModels.includes(fmt)) return { compatible: true };
      if (allowedImages.includes(fmt)) return { compatible: true }; // for flat image reference planes
      return { compatible: false, reason: 'Blender 无法理解 .ma、.mb 或 .max 专有DCC场景网格' };
    }

    // Maya (FBX, OBJ, ma, mb) + flat images for Image Plane
    if (appId === AppId.Maya) {
      const allowedModels = ['fbx', 'obj', 'ma', 'mb'];
      const allowedImages = ['png', 'jpg', 'jpeg'];
      if (allowedModels.includes(fmt)) return { compatible: true };
      if (allowedImages.includes(fmt)) return { compatible: true };
      return { compatible: false, reason: 'Maya 面板不接收 .blend 及 .max 格式，请预先执行转换' };
    }

    // 3ds Max (FBX, OBJ, max) + flat images for Viewport Background
    if (appId === AppId.Max3ds) {
      const allowedModels = ['fbx', 'obj', 'max'];
      const allowedImages = ['png', 'jpg', 'jpeg'];
      if (allowedModels.includes(fmt)) return { compatible: true };
      if (allowedImages.includes(fmt)) return { compatible: true };
      return { compatible: false, reason: '3ds Max 架构下不支持 .ma / .mb、.blend，导入中止' };
    }

    return { compatible: false, reason: '非法或者并不兼容格式格式' };
  };

  // Get matching UI labels for compatibility import methods
  const getImportActionLabel = (format: string, appId: AppId): string => {
    const fmt = format.toLowerCase();
    const isImg = ['png', 'jpg', 'jpeg'].includes(fmt);

    if (appId === AppId.ComfyUI) {
      return isImg ? '投射至输入图像节点' : '投射至视频加载器';
    }
    if (appId === AppId.Photoshop) {
      return '导入 (热图层置入) 可选';
    }
    if (appId === AppId.Blender) {
      return isImg ? '置入为视图参考面' : '加载或追加三维网格 可选';
    }
    if (appId === AppId.Maya) {
      return isImg ? '置入为正视图像平面' : '导入当前 Dagger 层 可选';
    }
    if (appId === AppId.Max3ds) {
      return isImg ? '置入为物理视口背景' : '追加加载合并三维场景 可选';
    }
    return '直接流式置入';
  };

  // Click on Import DCC Button
  const handleImportDccTrigger = (asset: ArtAsset, appId: AppId) => {
    // 1. Is DCC connected?
    const dcc = apps.find(a => a.id === appId);
    if (!dcc || dcc.status !== AppStatus.Connected) {
      alert(`[一键导入失败]\nDCC 软件 【${appId.toUpperCase()}】 尚未连接。\n\n请在边栏左下方切至“应用管理”页面，检查版本匹配并点击【启动软件】，等候端口通讯响应变更为“已连接”后再执行导入。`);
      return;
    }

    // 2. Is material downloaded?
    const downloaded = downloadedAssetIds.has(asset.id);
    if (!downloaded) {
      // PRD: If not downloaded, auto download first then run import!
      addLog(`📥 触发一键导入: 检测到本地文件暂欠缺。 launcher 将先行自动拉取下载...`, 'warning');
      
      // Auto queue download, setting custom hook for import trigger on complete!
      const requiredGB = asset.sizeMB / 1024;
      if (simulatedDiskGB < requiredGB) {
        addLog(`❌ 存储限制：一键导入下载缓存失败。`, 'error');
        alert(`一键导入遭到磁盘限制阻断，空间需要 ${asset.sizeMB} MB，当前磁盘不足。`);
        return;
      }

      // Add to active download queue with target app override hook!
      const downloadingCount = activeDownloads.filter(d => d.status === 'downloading').length;
      const initialStatus = downloadingCount < 3 ? 'downloading' : 'queued';

      setActiveDownloads(prev => [...prev, {
        assetId: asset.id,
        progress: 0,
        status: initialStatus,
        targetDccImportAfterDownload: appId
      }]);

      if (initialStatus === 'queued') {
        addLog(`⏳ ${asset.name} 离线拉取队列排队中，素材下载完后将立刻自动推送至 ${dcc.name}...`, 'warning');
      } else {
        simulateDownloadProgress(asset.id);
      }
      return;
    }

    // 3. Asset is already downloaded, directly proceed
    triggerDirectImport(asset, appId);
  };

  const triggerDirectImport = (asset: ArtAsset, appId: AppId) => {
    const isOptional = ['photoshop', 'blender', 'maya', 'max3ds'].includes(appId) && 
      !['png', 'jpg', 'jpeg'].includes(asset.format.toLowerCase()); // Flat images behave normally, models are "可选"

    const isImgPs = appId === AppId.Photoshop; // Images to PS are also "可选" enligt matrix

    if (isOptional || isImgPs) {
      // Pop up import choice dialog
      setImportOptionsConfig({ asset, dccId: appId });
      
      // Seed default option
      if (appId === AppId.Photoshop) {
        setSelectedImportMode('layer');
      } else if (appId === AppId.Blender) {
        setSelectedImportMode('append');
      } else if (appId === AppId.Maya) {
        setSelectedImportMode('importScene');
      } else if (appId === AppId.Max3ds) {
        setSelectedImportMode('merge');
      }
    } else {
      // Immediate non-optional import execution
      showImportSuccessNotification(asset, appId, 'default');
    }
  };

  const showImportSuccessNotification = (asset: ArtAsset, appId: AppId, mode: string) => {
    const dcc = apps.find(a => a.id === appId);
    let modeText = 'API数据直达';
    if (mode === 'layer') modeText = '智能多重蒙版图层置入';
    if (mode === 'artboard') modeText = '新建汉代UI独立画板排布';
    if (mode === 'append') modeText = '网格树几何追加';
    if (mode === 'link') modeText = '场景外部网格关联引用';
    if (mode === 'importScene') modeText = '导入激活的 Dagger 大纲坐标组中';
    if (mode === 'newScene') modeText = '强制覆盖新建原始DCC大场景';
    if (mode === 'merge') modeText = '追加融合至选中多边形顶点';

    addLog(`🚀 [一键热导入] ${asset.name} 格式为.${asset.format} 已通过专属IT通道，以【${modeText}】模式向 ${dcc?.name} 进程发送热推送！已确认在建模/绘图视窗内实例化就绪。`, 'success');
    alert(`[DCC 一键热导入成功]\n\n素材: ${asset.name}\n已投送至: ${dcc?.name}\n投送模式: ${modeText}\n\n可在DCC的当前激活面板或编辑器大纲视图(Outliner)中直接进行细节调整。`);
  };

  // Close Optional Dialog and complete
  const submitOptionalImport = () => {
    if (!importOptionsConfig) return;
    showImportSuccessNotification(importOptionsConfig.asset, importOptionsConfig.dccId, selectedImportMode);
    setImportOptionsConfig(null);
  };

  // Clear specific download task in queue
  const cancelActiveDownload = (id: string) => {
    setActiveDownloads(prev => prev.filter(d => d.assetId !== id));
    addLog(`⚠️ 已从后台下载排队中移除该素材缓存下载操作。`, 'warning');
  };

  // Filtering calculation
  const filteredAssets = assets.filter(asset => {
    if (!isProjectA) return false;

    // Cat filter
    if (selectedCat !== AssetCategory.All && asset.category !== selectedCat) return false;

    // Search Box keyword matching title or tags
    if (keyword.trim() !== '') {
      const kw = keyword.toLowerCase();
      const matchTitle = asset.name.toLowerCase().includes(kw);
      const matchTags = asset.tags.some(t => t.toLowerCase().includes(kw));
      return matchTitle || matchTags;
    }

    return true;
  });

  const itemsPerPage = 12;
  const totalPages = Math.ceil(filteredAssets.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedAssets = filteredAssets.slice(startIndex, startIndex + itemsPerPage);
  const selectedAssetTask = selectedAsset
    ? activeDownloads.find(task => task.assetId === selectedAsset.id)
    : null;
  const selectedAssetCategoryName = selectedAsset
    ? categoryTabs.find(tab => tab.id === selectedAsset.category)?.name ?? selectedAsset.category
    : '';

  return (
    <div className="flex-1 overflow-hidden flex flex-col font-sans">
      
      {/* Top section: Title and search */}
      <div className="p-6 pb-2 border-b border-[#27272a] shrink-0">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-xl font-bold font-display tracking-tight text-white flex items-center gap-2">
              <FolderOpen size={22} className="text-[#00ff00]" />
              项目美术素材库
            </h1>
          </div>

          {/* Keyword Search box */}
          {isProjectA && (
            <div className="relative w-full md:w-68 shrink-0">
              <Search size={14} className="absolute left-3 top-2.5 text-zinc-500" />
              <input 
                type="text" 
                value={keyword}
                onChange={e => setKeyword(e.target.value)}
                placeholder="搜索素材名或细分标签(如:盔甲)..."
                className="w-full bg-zinc-950 border border-zinc-900 focus:border-[#00ff00] transition-colors outline-none text-xs rounded py-2 pl-9 pr-4 text-zinc-200 font-mono"
              />
            </div>
          )}
        </div>

        {/* Category Tabs inside Project Space A */}
        {isProjectA && (
          <div className="mt-5 flex items-center justify-between gap-4 pb-2 font-mono">
            <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto scrollbar-none">
              {categoryTabs.map((tab) => {
                const isSelected = selectedCat === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setSelectedCat(tab.id)}
                    className={`px-3 py-1 font-mono text-[10.5px] rounded whitespace-nowrap cursor-pointer transition-all border cat-tab-btn ${
                      isSelected 
                        ? 'bg-white text-black font-semibold border-white shadow is-selected' 
                        : 'bg-transparent border-zinc-900 text-zinc-400 hover:text-white hover:border-zinc-700'
                    }`}
                  >
                    {tab.name}
                  </button>
                );
              })}
            </div>

            <div className="asset-card-info-control flex shrink-0 items-center gap-2">
              <span className="text-[10.5px] font-bold text-white whitespace-nowrap">
                {showAssetCardInfo ? '显示素材信息' : '仅查看素材封面'}
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={showAssetCardInfo}
                aria-label="切换素材卡片信息显示"
                onClick={() => setShowAssetCardInfo(prev => !prev)}
                className="asset-card-info-switch"
              >
                <span />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Main body content */}
      {!isProjectA ? (
        /* Empty status for space B, Shared, Personal */
        <div className="flex-1 overflow-y-auto p-12 flex flex-col items-center justify-center text-center select-none">
          <div className="w-16 h-16 rounded-full bg-zinc-900 border border-[#27272a] flex items-center justify-center text-zinc-500 mb-4/5 text-zinc-600">
            <FolderDot size={28} />
          </div>
          <h3 className="text-sm font-bold text-zinc-300 font-display mt-4">该空间无可用素材</h3>
          <p className="text-xs text-zinc-500 mt-2 max-w-sm leading-relaxed font-mono">
            【{currentSpace.name}】目前暂无管理员预置和发布的 3D/2D 资产大包。
            <br/>
            请通过边栏顶级空间下拉菜单，快捷切到 <span className="text-[#00ff00] underline font-bold cursor-pointer hover:text-white" onClick={() => setSelectedCat(AssetCategory.All)}>项目空间 A (三国奇幻RPG)</span> 提取并调用模型。
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto p-6">
            {filteredAssets.length === 0 ? (
              <div className="h-64 border border-dashed border-[#27272a] rounded flex flex-col items-center justify-center p-8 text-center text-zinc-500 text-xs">
                没有找到匹配 “{keyword}” 描述的美术内容包。
              </div>
            ) : (
              <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                {paginatedAssets.map((asset) => {
                  const isCurSelected = selectedAsset?.id === asset.id;
                  const isDownloaded = downloadedAssetIds.has(asset.id);

                  // Check if currently downloading/queued
                  const activeTask = activeDownloads.find(task => task.assetId === asset.id);

                  return (
                    <div
                      key={asset.id}
                      onClick={() => setSelectedAsset(asset)}
                      className={`group/card bg-[#0c0c0e] border rounded overflow-hidden cursor-pointer flex flex-col transition-all relative ${
                        isCurSelected
                          ? 'border-[#00ff00]'
                          : 'border-[#27272a] hover:border-zinc-700'
                      }`}
                    >
                      {/* Thumbnail wrapper */}
                      <div className="aspect-video relative overflow-hidden bg-black/60 shrink-0 select-none border-b border-[#18181b]">
                        <img
                          src={asset.thumbnail}
                          alt={asset.name}
                          className="w-full h-full object-cover transition-transform duration-500 group-hover/card:scale-105"
                          referrerPolicy="no-referrer"
                        />

                        {/* Format sticker and category indicator */}
                        <div className="absolute top-2 left-2 flex items-center gap-1">
                          <span className="text-[9.5px] font-mono bg-black/90 text-[#00ff00] font-bold border border-zinc-800 px-1 py-0.2 rounded uppercase">
                            .{asset.format}
                          </span>
                        </div>

                        {/* Status overlays (Download Status / Queued) */}
                        {isDownloaded && (
                          <div className="absolute top-2 right-2 bg-[#00ff00] text-black rounded-full p-1 shadow-lg">
                            <CheckCircle size={12} fill="currentColor" className="text-black" />
                          </div>
                        )}

                        {activeTask && (
                          <div className="absolute inset-0 bg-black/75 backdrop-blur-xs flex flex-col items-center justify-center p-3 text-center">
                            {activeTask.status === 'queued' ? (
                              <div className="flex flex-col items-center gap-1.5 animate-pulse">
                                <Clock size={16} className="text-amber-400" />
                                <span className="text-[10px] font-mono text-amber-400 font-bold">排队等候中...</span>
                              </div>
                            ) : (
                              <div className="w-full px-4 flex flex-col items-center">
                                <div className="w-6 h-6 rounded-full border-2 border-t-transparent border-[#00ff00] animate-spin mb-1.5"></div>
                                <span className="text-[10px] font-mono text-zinc-300">后台高速并行拉取中</span>
                                <span className="text-[12px] font-mono text-[#00ff00] font-bold mt-0.5">{activeTask.progress}%</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {showAssetCardInfo && (
                        <div className="p-3.5 flex-1 flex flex-col justify-between">
                          <div>
                            <h3 className="text-xs font-bold text-white tracking-wide font-sans line-clamp-1 truncate block group-hover/card:text-[#00ff00] transition-colors">
                              {asset.name}
                            </h3>
                            <div className="flex items-center gap-2 mt-1 px-0.5">
                              <span className="text-[9.2px] font-mono text-zinc-500 uppercase">
                                类别: {asset.category.replace('_', ' ')}
                              </span>
                            </div>
                          </div>

                          <div className="mt-3.5 pt-2 border-t border-zinc-900 flex justify-between items-center text-[10px] font-mono text-zinc-500">
                            <span>大小: {asset.sizeMB} MB</span>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                setSelectedAsset(asset);
                              }}
                              className="text-zinc-400 text-[10.5px] group-hover/card:text-[#00ff00] flex items-center transition-colors cursor-pointer"
                            >
                              查看素材详情
                              <ExternalLink size={10} className="ml-1" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="px-6 py-4 border-t border-[#27272a] bg-[#0c0c0e]/80 backdrop-blur-md flex flex-col sm:flex-row items-center justify-between gap-4 shrink-0 font-mono text-xs text-zinc-400 select-none">
              <div className="flex items-center gap-2">
                <span className="text-zinc-500">
                  当前显示 <span className="text-[#00ff00] font-bold">{startIndex + 1} - {Math.min(startIndex + itemsPerPage, filteredAssets.length)}</span> / 共 <span className="text-white font-bold">{filteredAssets.length}</span> 项
                </span>
              </div>

              <div className="flex items-center gap-1">
                {/* Previous Page Button */}
                <button
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  className={`p-2 rounded border border-[#27272a] transition-all ${
                    currentPage === 1
                      ? 'text-zinc-700 bg-transparent cursor-not-allowed opacity-40'
                      : 'text-zinc-300 hover:text-white hover:border-[#00ff00]/60 bg-[#0c0c0e] hover:bg-zinc-900 cursor-pointer'
                  }`}
                  title="上一页"
                >
                  <ChevronLeft size={14} className="pointer-events-none" />
                </button>

                {/* Page numbers */}
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
                  const isCurrent = page === currentPage;
                  return (
                    <button
                      key={page}
                      onClick={() => setCurrentPage(page)}
                      className={`w-8 h-8 rounded border transition-all text-xs font-mono font-medium ${
                        isCurrent
                          ? 'bg-zinc-950 border-[#00ff00] text-[#00ff00] font-bold'
                          : 'bg-transparent border-zinc-900 hover:border-zinc-700 hover:bg-zinc-900 text-zinc-400 hover:text-white cursor-pointer'
                      }`}
                    >
                      {page}
                    </button>
                  );
                })}

                {/* Next Page Button */}
                <button
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  className={`p-2 rounded border border-[#27272a] transition-all ${
                    currentPage === totalPages
                      ? 'text-zinc-700 bg-transparent cursor-not-allowed opacity-40'
                      : 'text-zinc-300 hover:text-white hover:border-[#00ff00]/60 bg-[#0c0c0e] hover:bg-zinc-900 cursor-pointer'
                  }`}
                  title="下一页"
                >
                  <ChevronRight size={14} className="pointer-events-none" />
                </button>
              </div>

              <div className="hidden md:block text-zinc-500 text-[10px]">
                页码: {currentPage} / {totalPages}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Large asset detail modal */}
      {selectedAsset && (
        <div
          className="fixed inset-0 z-40 bg-black/80 backdrop-blur-sm p-4 md:p-6 flex items-center justify-center"
          onClick={() => setSelectedAsset(null)}
        >
          <div
            className="h-[min(88vh,760px)] w-full max-w-[1200px] bg-[#0c0c0e] border border-[#27272a] rounded-xl overflow-hidden flex flex-col lg:flex-row"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="relative flex-1 min-h-[280px] bg-black border-b lg:border-b-0 lg:border-r border-[#27272a]">
              <img
                src={selectedAsset.previewUrl}
                alt={selectedAsset.name}
                className="w-full h-full object-contain"
                referrerPolicy="no-referrer"
              />

              <div className="asset-source-badge absolute bottom-4 right-4 flex bg-black/95 border border-zinc-800 rounded px-2 py-1 text-[10px] font-mono text-zinc-400 items-center gap-1">
                <span>来源:</span>
                <span className="text-white font-bold force-text-white">{selectedAsset.platform}</span>
              </div>
            </div>

            <div className="w-full lg:w-[390px] xl:w-[420px] bg-[#0a0a0c] border-t lg:border-t-0 lg:border-l border-[#27272a] p-5 overflow-y-auto flex flex-col">
              <div className="flex items-center justify-between gap-3 border-b border-zinc-900 pb-3 shrink-0">
                <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-mono">
                  素材详情
                </p>
                <button
                  type="button"
                  aria-label="关闭素材详情"
                  title="关闭素材详情"
                  onClick={() => setSelectedAsset(null)}
                  className="asset-detail-close flex h-7 w-7 shrink-0 items-center justify-center rounded border border-zinc-800 bg-black text-zinc-400 transition-colors hover:border-[#00ff00]/60 hover:text-white"
                >
                  <X size={14} />
                </button>
              </div>

              <div className="mt-4 space-y-4">
                <div>
                  <h2 className="text-base font-bold text-white leading-snug font-display">
                    {selectedAsset.name}
                  </h2>
                  <p className="mt-2 text-xs text-zinc-400 leading-relaxed font-sans bg-black p-2.5 border border-zinc-900 rounded select-text">
                    {selectedAsset.desc}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                  <div className="bg-black border border-zinc-900 rounded p-2.5">
                    <p className="text-zinc-500 text-[10px]">文件格式</p>
                    <p className="mt-1 text-[#00ff00] font-bold">.{selectedAsset.format.toUpperCase()}</p>
                  </div>
                  <div className="bg-black border border-zinc-900 rounded p-2.5">
                    <p className="text-zinc-500 text-[10px]">资产大小</p>
                    <p className="mt-1 text-zinc-300 font-bold">{selectedAsset.sizeMB} MB</p>
                  </div>
                  <div className="bg-black border border-zinc-900 rounded p-2.5">
                    <p className="text-zinc-500 text-[10px]">分类</p>
                    <p className="mt-1 text-zinc-300 font-bold">{selectedAssetCategoryName}</p>
                  </div>
                  <div className="bg-black border border-zinc-900 rounded p-2.5">
                    <p className="text-zinc-500 text-[10px]">分发创作者</p>
                    <p className="mt-1 text-zinc-300 font-bold truncate" title={selectedAsset.author}>{selectedAsset.author}</p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {selectedAsset.tags.map((tag) => (
                    <span key={tag} className="text-[10px] font-mono bg-[#00ff00]/5 border border-[#00ff00]/20 text-[#00ff00] px-2 py-0.5 rounded">
                      #{tag}
                    </span>
                  ))}
                </div>

                {/* ACTION BUTTONS (F9 Paths) */}
                <div className="pt-3.5 border-t border-zinc-900 space-y-3">
                  {/* Path A: Local high-speed download */}
                  <div>
                    <h4 className="text-[10.2px] text-zinc-500 font-mono uppercase mb-1.5 tracking-wide">
                      本地磁盘离线提取
                    </h4>

                    {selectedAssetTask ? (
                      <div className="w-full bg-[#121214] border border-dashed border-zinc-800 p-3.5 rounded text-center font-mono">
                        {selectedAssetTask.status === 'queued' ? (
                          <div className="flex flex-col gap-1 items-center">
                            <span className="text-xs text-amber-400 font-bold animate-pulse">等候下载空闲槽中</span>
                            <span className="text-[9.5px] text-zinc-500 leading-tight">由于网络和并发限制，至多同时执行 3 个素材下载包。</span>
                            <button
                              onClick={() => cancelActiveDownload(selectedAsset.id)}
                              className="mt-2 text-red-500 hover:text-red-400 text-[10px] underline cursor-pointer"
                            >
                              移出缓冲区
                            </button>
                          </div>
                        ) : (
                          <div className="flex flex-col gap-1.5">
                            <div className="flex justify-between text-xs text-zinc-400">
                              <span>下载拉取中...</span>
                              <span className="text-[#00ff00] font-bold">{selectedAssetTask.progress}%</span>
                            </div>
                            <div className="w-full bg-zinc-800 rounded-full h-1 overflow-hidden">
                              <div
                                className="bg-[#00ff00] h-full"
                                style={{ width: `${selectedAssetTask.progress}%` }}
                              ></div>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <button
                        onClick={() => handleLocalDownload(selectedAsset)}
                        className={`w-full py-2 px-4 text-xs font-semibold rounded flex items-center justify-center gap-1.5 transition-all text-center cursor-pointer ${
                          downloadedAssetIds.has(selectedAsset.id)
                            ? 'bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white btn-secondary'
                            : 'bg-white hover:bg-zinc-150 text-black font-bold shadow-lg btn-primary'
                        }`}
                      >
                        <Download size={13} />
                        {downloadedAssetIds.has(selectedAsset.id)
                          ? '已下载 · 在资源管理器中打开文件夹'
                          : `下载到本地缓存 (${selectedAsset.sizeMB} MB)`
                        }
                      </button>
                    )}
                  </div>

                  {/* Path B: Smart DCC hot import */}
                  <div>
                    <h4 className="text-[10px] text-zinc-500 font-mono uppercase mb-1.5 tracking-wide">
                      专属通道智能热导入 DCC
                    </h4>

                    {/* Compatible DCC targets mapping matrix */}
                    <div className="space-y-1.5">
                      {[AppId.ComfyUI, AppId.Blender, AppId.Photoshop, AppId.Maya, AppId.Max3ds].map((appId) => {
                        const dccApp = apps.find(app => app.id === appId);
                        const isConnected = dccApp?.status === AppStatus.Connected;
                        const { compatible, reason } = checkCompatibility(selectedAsset.format, appId);

                        if (!compatible) {
                          return (
                            <div
                              key={appId}
                              title={reason}
                              className="w-full bg-[#121214]/40 border border-dashed border-zinc-900/60 p-2 text-zinc-650 rounded text-[10px] font-mono flex items-center gap-2 select-none cursor-not-allowed opacity-35"
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-zinc-600"></span>
                              <span className="uppercase font-bold shrink-0">{appId === AppId.Max3ds ? '3DS MAX' : appId}:</span>
                              <span className="truncate line-clamp-1">{reason}</span>
                            </div>
                          );
                        }

                        return (
                          <button
                            key={appId}
                            onClick={() => handleImportDccTrigger(selectedAsset, appId)}
                            className={`w-full p-2.5 rounded text-left border text-[11px] font-mono flex items-center justify-between transition-all cursor-pointer ${
                              isConnected
                                ? 'bg-black border-[#00ff00]/40 text-zinc-200 hover:bg-[#00ff00]/10 hover:border-[#00ff00] hover:text-white glow-btn group/btn'
                                : 'bg-[#121214] border-zinc-900 text-zinc-500 hover:border-zinc-800'
                            }`}
                          >
                            <div className="flex items-center gap-2 overflow-hidden">
                              <div className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-[#00ff00]' : 'bg-red-500'}`}></div>
                              <span className={`uppercase font-bold ${isConnected ? 'text-[#00ff00]' : 'text-zinc-400'}`}>
                                {appId === AppId.Max3ds ? '3D MAX' : appId}
                              </span>
                              <span className="text-[9.5px] text-zinc-500 shrink-0 select-none">|</span>
                              <span className={`truncate text-[10px] ${isConnected ? 'text-zinc-300' : 'text-zinc-500'}`}>
                                {getImportActionLabel(selectedAsset.format, appId)}
                              </span>
                            </div>
                            <CornerDownRight size={11} className={`shrink-0 ${isConnected ? 'text-[#00ff00] group-hover/btn:translate-x-0.5 transition-transform' : 'text-zinc-500'}`} />
                          </button>
                        );
                      })}
                    </div>
                  </div>

                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DETAILED MODAL 1: OPTION MODAL BASED ON DCC TYPE ("可选" Matrix path) */}
      {importOptionsConfig && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#0c0c0e] border border-[#27272a] rounded p-6 max-w-md w-full font-sans">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-base font-bold text-white font-display flex items-center gap-2">
                <Shuffle size={16} className="text-[#00ff00]" />
                一键导入模式配置: {apps.find(a => a.id === importOptionsConfig.dccId)?.name}
              </h3>
              <button onClick={() => setImportOptionsConfig(null)} className="text-zinc-400 hover:text-white">
                <X size={16} />
              </button>
            </div>

            <p className="text-xs text-zinc-400 mb-4 font-mono leading-relaxed">
              素材 <b>{importOptionsConfig.asset.name}</b> 触发推送指令。
              由于该资产不支持单模型热插拔同步，宿主 DCC 提供了以下实例化承接模式，请根据作业流需求选择：
            </p>

            <div className="bg-zinc-950 border border-zinc-900 rounded p-4 mb-6">
              {/* PHOTOSHOP IMAGES OPTIONS */}
              {importOptionsConfig.dccId === AppId.Photoshop && (
                <div className="space-y-3 text-xs font-mono">
                  <button
                    onClick={() => setSelectedImportMode('layer')}
                    className={`w-full text-left p-3 rounded-md border ${
                      selectedImportMode === 'layer'
                        ? 'bg-[#00ff00]/5 border-[#00ff00] text-white font-bold'
                        : 'bg-black border-zinc-900 text-zinc-400 hover:text-white'
                    }`}
                  >
                    <div className="flex justify-between">
                      <span>方式一：热智能对象图层置入</span>
                      {selectedImportMode === 'layer' && <CheckCircle size={13} className="text-[#00ff00]" />}
                    </div>
                    <p className="text-[10px] text-zinc-500 mt-1 font-normal leading-normal">
                      将素材按高精智能矢量对象直接叠加图层导入到当前最顶层的活跃视区，不破坏底层原画底稿。
                    </p>
                  </button>

                  <button
                    onClick={() => setSelectedImportMode('artboard')}
                    className={`w-full text-left p-3 rounded-md border ${
                      selectedImportMode === 'artboard'
                        ? 'bg-[#00ff00]/5 border-[#00ff00] text-white font-bold'
                        : 'bg-black border-zinc-900 text-zinc-400 hover:text-white'
                    }`}
                  >
                    <div className="flex justify-between">
                      <span>方式二：独立画板栅格化排放</span>
                      {selectedImportMode === 'artboard' && <CheckCircle size={13} className="text-[#00ff00]" />}
                    </div>
                    <p className="text-[10px] text-zinc-500 mt-1 font-normal leading-normal">
                      根据素材本身物理尺寸，在 Photoshop 工程内横向增设一个命名完备的九宫格独立画板排布资产。
                    </p>
                  </button>
                </div>
              )}

              {/* BLENDER MODELS OPTIONS */}
              {importOptionsConfig.dccId === AppId.Blender && (
                <div className="space-y-3 text-xs font-mono">
                  <button
                    onClick={() => setSelectedImportMode('append')}
                    className={`w-full text-left p-3 rounded-md border ${
                      selectedImportMode === 'append'
                        ? 'bg-[#00ff00]/5 border-[#00ff00] text-white font-bold'
                        : 'bg-black border-zinc-900 text-zinc-400 hover:text-white'
                    }`}
                  >
                    <div className="flex justify-between">
                      <span>方式一：直接本体追加导入</span>
                      {selectedImportMode === 'append' && <CheckCircle size={13} className="text-[#00ff00]" />}
                    </div>
                    <p className="text-[10px] text-zinc-500 mt-1 font-normal leading-normal">
                      将.blend 模型里的几何体、网格纹理以及着色节点，通过本地打包直接写入并追加到当前主工程内，支持直接解构修改。
                    </p>
                  </button>

                  <button
                    onClick={() => setSelectedImportMode('link')}
                    className={`w-full text-left p-3 rounded-md border ${
                      selectedImportMode === 'link'
                        ? 'bg-[#00ff00]/5 border-[#00ff00] text-white font-bold'
                        : 'bg-black border-zinc-900 text-zinc-400 hover:text-white'
                    }`}
                  >
                    <div className="flex justify-between">
                      <span>方式二：外部资源轻量引用</span>
                      {selectedImportMode === 'link' && <CheckCircle size={13} className="text-[#00ff00]" />}
                    </div>
                    <p className="text-[10px] text-zinc-500 mt-1 font-normal leading-normal">
                      建立场景对外部下载目录的单向只读软关联，仅投射几何虚影。工程轻量且当服务器源文件更新时可自动同频。
                    </p>
                  </button>
                </div>
              )}

              {/* MAYA OPTIONS */}
              {importOptionsConfig.dccId === AppId.Maya && (
                <div className="space-y-3 text-xs font-mono">
                  <button
                    onClick={() => setSelectedImportMode('importScene')}
                    className={`w-full text-left p-3 rounded-md border ${
                      selectedImportMode === 'importScene'
                        ? 'bg-[#00ff00]/5 border-[#00ff00] text-white font-bold'
                        : 'bg-black border-zinc-900 text-zinc-400 hover:text-white'
                    }`}
                  >
                    <div className="flex justify-between">
                      <span>方式一：导入并入当前层</span>
                      {selectedImportMode === 'importScene' && <CheckCircle size={13} className="text-[#00ff00]" />}
                    </div>
                    <p className="text-[10px] text-zinc-500 mt-1 font-normal leading-normal">
                      并入当前场景，大纲视图将增设项目专用命名空间，自动清除无关的多余空变换节点。
                    </p>
                  </button>

                  <button
                    onClick={() => setSelectedImportMode('newScene')}
                    className={`w-full text-left p-3 rounded-md border ${
                      selectedImportMode === 'newScene'
                        ? 'bg-[#00ff00]/5 border-[#00ff00] text-white font-bold'
                        : 'bg-black border-zinc-900 text-zinc-400 hover:text-white'
                    }`}
                  >
                    <div className="flex justify-between">
                      <span>方式二：强制新建场景加载</span>
                      {selectedImportMode === 'newScene' && <CheckCircle size={13} className="text-[#00ff00]" />}
                    </div>
                    <p className="text-[10px] text-zinc-500 mt-1 font-normal leading-normal">
                      重置并清空现有的 Maya 视图卡槽。拉起新工程用于对该次世代装备/马匹模型执行独立微调制备。
                    </p>
                  </button>
                </div>
              )}

              {/* 3DS MAX OPTIONS */}
              {importOptionsConfig.dccId === AppId.Max3ds && (
                <div className="space-y-3 text-xs font-mono">
                  <button
                    onClick={() => setSelectedImportMode('merge')}
                    className={`w-full text-left p-3 rounded-md border ${
                      selectedImportMode === 'merge'
                        ? 'bg-[#00ff00]/5 border-[#00ff00] text-white font-bold'
                        : 'bg-black border-zinc-900 text-zinc-400 hover:text-white'
                    }`}
                  >
                    <div className="flex justify-between">
                      <span>方式一：场景追加合并</span>
                      {selectedImportMode === 'merge' && <CheckCircle size={13} className="text-[#00ff00]" />}
                    </div>
                    <p className="text-[10px] text-zinc-500 mt-1 font-normal leading-normal">
                      运行 3ds Max 经典 Merge 合并流程，将选定几何多边形直接合并入现有的渲染图层中。
                    </p>
                  </button>

                  <button
                    onClick={() => setSelectedImportMode('newScene')}
                    className={`w-full text-left p-3 rounded-md border ${
                      selectedImportMode === 'newScene'
                        ? 'bg-[#00ff00]/5 border-[#00ff00] text-white font-bold'
                        : 'bg-black border-zinc-900 text-zinc-400 hover:text-white'
                    }`}
                  >
                    <div className="flex justify-between">
                      <span>方式二：作为新项目文件打开</span>
                      {selectedImportMode === 'newScene' && <CheckCircle size={13} className="text-[#00ff00]" />}
                    </div>
                    <p className="text-[10px] text-zinc-500 mt-1 font-normal leading-normal">
                      关闭当前作业面，打开此独立 max 三维工程包进行资产调色、法线烘焙渲染等。
                    </p>
                  </button>
                </div>
              )}
            </div>

            <div className="flex gap-3 justify-end font-mono">
              <button 
                onClick={() => setImportOptionsConfig(null)}
                className="px-4 py-1.5 border border-[#27272a] hover:border-zinc-500 text-zinc-400 hover:text-white rounded text-xs transition-colors btn-secondary"
              >
                取消导入
              </button>
              <button
                onClick={submitOptionalImport}
                className="px-5 py-1.5 bg-[#00ff00] text-black font-semibold rounded text-xs transition-colors hover:shadow-[0_0_10px_rgba(0,255,0,0.3)] glow-btn btn-special"
              >
                完成配置并投送
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
