-- Pandoc Lua filter: wrap Image + caption in samepage with needspace guard.
-- Usage: pandoc ... --lua-filter=keepimage.lua

function Pandoc(doc)
  local blocks = doc.blocks
  local result = {}
  local i = 1
  while i <= #blocks do
    local b = blocks[i]
    if b.t == 'Para' and #b.content >= 1 and b.content[1].t == 'Image' then
      local img = b.content[1]
      local src  = img.src
      local nextBlock = blocks[i + 1]
      if nextBlock and nextBlock.t == 'Para' then
        local capText = pandoc.utils.stringify(nextBlock)
        capText = capText:gsub('\\', '\\textbackslash{}')
                         :gsub('&', '\\&')
                         :gsub('%$', '\\$')
                         :gsub('#', '\\#')
                         :gsub('_', '\\_')
                         :gsub('%{', '\\{')
                         :gsub('%}', '\\}')
                         :gsub('~', '\\textasciitilde{}')
                         :gsub('%^', '\\textasciicircum{}')
                         :gsub('%%', '\\%')
        local latex = '\\needspace{0.65\\textheight}\n'
                    .. '\\begin{samepage}\n'
                    .. '\\begin{center}\n'
                    .. '\\includegraphics[width=0.88\\textwidth,height=0.72\\textheight,keepaspectratio]{'
                    .. src .. '}\n'
                    .. '\\vspace{0.4em}\n'
                    .. '{\\small\\textbf{' .. capText .. '}}\n'
                    .. '\\end{center}\n'
                    .. '\\end{samepage}\n'
        table.insert(result, pandoc.RawBlock('latex', latex))
        i = i + 2
      else
        table.insert(result, b)
        i = i + 1
      end
    else
      table.insert(result, b)
      i = i + 1
    end
  end
  doc.blocks = result
  return doc
end
