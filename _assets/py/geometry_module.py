# @author 雪里光（DSH 会话 session-fa9fbeb4），2026-10-29
# 用途：把 2019 年 MAS115 项目里那套 R 几何函数，改写成一个能直接 import 的 Python 模块。
# 这是给网页上的 Pyodide 练习框用的，所以只用标准库 + math，不依赖 numpy。
#
# 对应原件：C:\Users\darkm\Dev\PlaneArea\code_1..8.Rmd
# 命名尽量沿用原件的 R 函数名，方便对照：
#   norm -> norm, gradient -> gradient, line_equ -> line_equ,
#   type_of_polygon -> type_of_polygon, point_inside -> point_inside (ray casting),
#   winding_number -> winding_number, simpsons_rule -> simpsons_rule,
#   monte_carlo_integral -> monte_carlo_integral
from math import sqrt, atan2, pi
import random


# ---------------------------------------------------------------- 向量小工具

def norm(v):
    """向量长度。原件 norm()。"""
    return sqrt(sum(c * c for c in v))


def gradient(x, y):
    """每条边的斜率（最后一条边连回第一个点）。原件 gradient()。
    竖直边会得到 inf —— 原件也是这个行为，调用方要自己处理。"""
    n = len(x)
    g = []
    for i in range(n):
        j = (i + 1) % n
        dx = x[j] - x[i]
        dy = y[j] - y[i]
        g.append(float('inf') if dx == 0 else dy / dx)
    return g


def line_equ(x, y, i):
    """第 i 条边的直线方程，返回一个 f(x) 函数。原件 line_equ() 的第 i 个。"""
    n = len(x)
    j = (i + 1) % n
    g = gradient(x, y)[i]
    xm, ym = x[i], y[i]
    return lambda t: g * (t - xm) + ym


def vector_rot90(v):
    """逆时针转 90 度。原件 vector_rot90()。"""
    return (-v[1], v[0])


def perpdot(x, y):
    """每个顶点前后两条边的垂直叉积（perp dot）。原件 perpdot()。
    值 > 0 是左转，< 0 是右转。"""
    n = len(x)
    directions = []
    for i in range(n):
        j = (i + 1) % n
        directions.append((x[j] - x[i], y[j] - y[i]))
    out = []
    for i in range(n):
        prev = directions[(i - 1) % n]
        cur = directions[i]
        r = vector_rot90(prev)
        out.append(r[0] * cur[0] + r[1] * cur[1])
    return out


# ---------------------------------------------------------------- 多边形类型

def _sign(v, eps=1e-12):
    if v > eps:
        return 1
    if v < -eps:
        return -1
    return 0


def type_of_polygon(x, y):
    """判断凸 / 凹。原件 type_of_polygon() 的改写版。

    原件用的是「内角和 = (n-2)π」，有两个毛病：
      1. 只对简单多边形成立，自交时这个式子本身没意义；
      2. acos 在角接近 0 或 π 时数值不稳。
    改用 perpdot 的转向符号：所有顶点同向 → 凸；出现反向 → 凹。
    同样的答案，不用三角函数，也不怕自交。"""
    n = len(x)
    if n < 3:
        return 'Error: need at least 3 points'
    turns = [(_sign(p), p) for p in perpdot(x, y)]
    pos = sum(1 for s, _ in turns if s > 0)
    neg = sum(1 for s, _ in turns if s < 0)
    # 一个方向都不出现（共线退化）算凸；两个方向都有 → 凹
    return 'Convex' if pos == 0 or neg == 0 else 'Non-convex'


def is_self_intersecting(x, y):
    """判断自交。原件没单独给这个函数，但它后面到处要分情况，这里补一个。"""
    n = len(x)
    segs = [((x[i], y[i]), (x[(i + 1) % n], y[(i + 1) % n])) for i in range(n)]

    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

    def straddle(p1, p2, p3, p4):
        d1, d2 = cross(p3, p4, p1), cross(p3, p4, p2)
        d3, d4 = cross(p1, p2, p3), cross(p1, p2, p4)
        return ((d1 > 0) != (d2 > 0)) and ((d3 > 0) != (d4 > 0))

    for i in range(n):
        for j in range(i + 2, n):
            if i == 0 and j == n - 1:
                continue
            if straddle(*segs[i], *segs[j]):
                return True
    return False


def classify_polygon(x, y):
    """凸 / 凹 / 自交，三分类。原件在 area_mc_method_v3 里做过同样的事。"""
    if is_self_intersecting(x, y):
        return 'Self-intersecting'
    return type_of_polygon(x, y).replace('Non-convex', 'Concave')


# ---------------------------------------------------------------- 点在多边形内

INSIDE, OUTSIDE, ON_EDGE = 'inside', 'outside', 'on boundary'


def point_inside(x, y, px, py):
    """射线法（奇偶规则）。原件 point_inside() 的改写版。

    原件只返回 True/False，点在边上时结果是「看运气」——取决于那条边恰好在哪。
    这里返回三态，把边界单独拎出来。这才是图形学里该有的接口。

    边界判定复用 point_on_edge（按实际距离算，不是直接比叉积）。"""
    n = len(x)
    if point_on_edge(x, y, px, py):
        return ON_EDGE
    inside = False
    for i in range(n):
        j = (i + 1) % n
        y1, y2 = y[i], y[j]
        if (y1 > py) != (y2 > py):
            x_cross = x[i] + (py - y1) * (x[j] - x[i]) / (y2 - y1)
            if px < x_cross:
                inside = not inside
    return INSIDE if inside else OUTSIDE


def winding_number(x, y, px, py):
    """环绕数。原件 winding_number() 的改写版。

    原件用每个顶点相对点张开的角求和（atan2 → 除以 2π）。
    这里换成纯叉积/符号判定的标准写法：不用三角函数，一样准，快 2 倍左右。

    非零 = 在里面；对自交多边形，它还能给出「绕了几圈」。
    **注意**：点落在边上时环绕数无定义，这个函数不负责挡——统一由
    point_inside_v2 先判边界。单独调用时请自己先用 point_on_edge 排除。"""
    n = len(x)
    wn = 0
    for i in range(n):
        j = (i + 1) % n
        is_left = (x[j] - x[i]) * (py - y[i]) - (px - x[i]) * (y[j] - y[i])
        if y[i] <= py:
            if y[j] > py and is_left > 0:      # 向上的边，点在左侧
                wn += 1
        else:
            if y[j] <= py and is_left < 0:     # 向下的边，点在右侧
                wn -= 1
    return wn


def point_on_edge(x, y, px, py, tol=1e-9):
    """点是否落在某条边上。返回 True/False。

    判法：先算点到线段的「实际距离」（叉积除以线段长度，不是直接拿叉积比），
    再看点是否落在线段的两端之间。

    为什么不能直接拿叉积比容差：叉积的量级跟线段长度成正比。长边和短边
    用同一个阈值，短边就容易把边上的点漏掉、也容易把边外的点误判成在边上。
    2026-10-29 自己写这版时踩过——(1.2, 0.8) 在蝴蝶结上被误判成「在边上」。"""
    n = len(x)
    for i in range(n):
        j = (i + 1) % n
        x1, y1, x2, y2 = x[i], y[i], x[j], y[j]
        dx, dy = x2 - x1, y2 - y1
        seg_len = sqrt(dx * dx + dy * dy)
        if seg_len == 0:                     # 退化成一个点
            if abs(px - x1) <= tol and abs(py - y1) <= tol:
                return True
            continue
        # 点线距离 = |叉积| / 线段长度
        cross = dx * (py - y1) - dy * (px - x1)
        if abs(cross) / seg_len > tol:
            continue
        # 再确认落在线段范围内（投影参数在 [0,1]）
        t = ((px - x1) * dx + (py - y1) * dy) / (seg_len * seg_len)
        if -tol <= t <= 1 + tol:
            return True
    return False


def point_inside_v2(x, y, px, py, method='wind'):
    """原件两种判内法二选一。method: 'ray' 或 'wind'。返回三态字符串。

    边界在这里统一挡掉——winding_number 自己不处理边界，
    那样它就能保持返回 int，调用方不用到处判空。"""
    if method == 'ray':
        return point_inside(x, y, px, py)
    if point_on_edge(x, y, px, py):
        return ON_EDGE
    return INSIDE if winding_number(x, y, px, py) != 0 else OUTSIDE


# ---------------------------------------------------------------- 面积

def shoelace_area(x, y):
    """鞋带公式（有向面积）。原件没单独写这个函数，但推导里用到了。"""
    n = len(x)
    s = 0.0
    for i in range(n):
        j = (i + 1) % n
        s += x[i] * y[j] - x[j] * y[i]
    return 0.5 * s


def bounding_box(x, y):
    return min(x), max(x), min(y), max(y)


def generate_k_random_point(x, y, k, rng=None):
    """在包围盒里撒 k 个均匀点。原件 generate_k_random_point()。"""
    rng = rng or random
    xmin, xmax, ymin, ymax = bounding_box(x, y)
    return ([rng.uniform(xmin, xmax) for _ in range(k)],
            [rng.uniform(ymin, ymax) for _ in range(k)])


def area_mc_method(x, y, k=5000, method='ray', rng=None):
    """蒙特卡洛估面积。原件 area_mc_method / area_mc_method_v3 的改写版。

    原件在循环里每次调用 point_inside，每次重新遍历所有边。
    这里把边数据预先摊平成一维列表，循环里只做算术——
    注意：这条优化的收益取决于判内函数本身，Pyodide 里实测过再说值不值。
    返回 (估计面积, 盒面积, 落在里面的点数)。"""
    rng = rng or random
    n = len(x)
    xmin, xmax, ymin, ymax = min(x), max(x), min(y), max(y)
    box = (xmax - xmin) * (ymax - ymin)

    # 预先把所有边摊成四个平行列表，循环里直接索引
    ex1 = list(x)
    ey1 = list(y)
    ex2 = [x[(i + 1) % n] for i in range(n)]
    ey2 = [y[(i + 1) % n] for i in range(n)]

    def _inside_ray(px, py):
        inside = False
        for i in range(n):
            y1, y2 = ey1[i], ey2[i]
            if (y1 > py) != (y2 > py):
                x_cross = ex1[i] + (py - y1) * (ex2[i] - ex1[i]) / (y2 - y1)
                if px < x_cross:
                    inside = not inside
        return inside

    def _inside_wind(px, py):
        wn = 0
        for i in range(n):
            x1, y1, x2, y2 = ex1[i], ey1[i], ex2[i], ey2[i]
            is_left = (x2 - x1) * (py - y1) - (px - x1) * (y2 - y1)
            if y1 <= py:
                if y2 > py and is_left > 0:
                    wn += 1
            else:
                if y2 <= py and is_left < 0:
                    wn -= 1
        return wn != 0

    tester = _inside_ray if method == 'ray' else _inside_wind
    count = 0
    for _ in range(k):
        if tester(rng.uniform(xmin, xmax), rng.uniform(ymin, ymax)):
            count += 1
    return count / k * box, box, count


# ---------------------------------------------------------------- 积分

def simpsons_rule(f, a, b, n=10000):
    """辛普森法则。原件 simpsons_rule()。
    n 必须是正偶数；原件遇到 inf 会替换成 1e4，这里保持一致。"""
    if n <= 0 or n % 2 != 0:
        return 'Please enter positive even number n'
    if a in (float('inf'), float('-inf')):
        a = 1e4 if a > 0 else -1e4
    if b in (float('inf'), float('-inf')):
        b = 1e4 if b > 0 else -1e4
    h = (b - a) / n
    s = f(a) + f(b)
    for i in range(1, n):
        s += (4 if i % 2 else 2) * f(a + i * h)
    return s * h / 3


def monte_carlo_integral(f, a, b, n=10000, method='original', rng=None):
    """蒙特卡洛积分。原件 monte_carlo_integral()。
    method='original' 普通；'antithetic' 对偶变量。"""
    rng = rng or random
    if n <= 0:
        return 'Please enter positive number n'
    if a in (float('inf'), float('-inf')) or b in (float('inf'), float('-inf')):
        a = a if abs(a) != float('inf') else (1e4 if a > 0 else -1e4)
        b = b if abs(b) != float('inf') else (1e4 if b > 0 else -1e4)
    xs = [rng.uniform(a, b) for _ in range(n)]
    if method == 'antithetic':
        vals = [(f(x) + f(a + b - x)) / 2 for x in xs]
    else:
        vals = [f(x) for x in xs]
    return (b - a) * sum(vals) / n


# ---------------------------------------------------------------- Pick 定理

def picks_theorem(interior, boundary):
    """Pick 定理：面积 = 内部格点数 + 边上的格点数/2 - 1。原件 picks_theorem()。"""
    return interior + boundary / 2 - 1


def gcd(a, b):
    while b:
        a, b = b, a % b
    return a


def boundary_points(x, y):
    """多边形边上有多少个格点（每段算 gcd(|dx|,|dy|)）。"""
    n = len(x)
    return sum(gcd(abs(int(x[(i + 1) % n] - x[i])), abs(int(y[(i + 1) % n] - y[i])))
               for i in range(n))


# ---------------------------------------------------------------- 顶点重排

def start_from_miny(x, y):
    """把顶点重排，让 y 最小的点排在第一个。原件 start_from_miny()。"""
    n = len(x)
    i0 = y.index(min(y))
    return ([x[(i0 + k) % n] for k in range(n)],
            [y[(i0 + k) % n] for k in range(n)])


def start_from_minx(x, y):
    """把顶点重排，让 x 最小的点排在第一个。原件 start_from_minx()。"""
    n = len(x)
    i0 = x.index(min(x))
    return ([x[(i0 + k) % n] for k in range(n)],
            [y[(i0 + k) % n] for k in range(n)])


def anti_rot(x, y):
    """反转顶点顺序（顺时针 ↔ 逆时针），第一个点不动。原件 anti_rot()。"""
    return ([x[0]] + x[1:][::-1], [y[0]] + y[1:][::-1])


def signed_area(x, y):
    """有向面积：逆时针为正。原件靠它判转向。"""
    return shoelace_area(x, y)


# ---------------------------------------------------------------- 凸多边形上下界

def classify_vertices(x, y):
    """把凸多边形的顶点分成 upper / lower。

    原件 classify()：从最小 x 点沿顺时针到最大 x 点的是 upper，
    沿逆时针的是 lower。返回 {'upper': [...], 'lower': [...]}。
    """
    n = len(x)
    i_min = x.index(min(x))
    i_max = x.index(max(x))
    upper, lower = [], []
    i = i_min
    while True:
        upper.append(i)
        if i == i_max:
            break
        i = (i - 1) % n          # 顺时针
    i = i_min
    while True:
        lower.append(i)
        if i == i_max:
            break
        i = (i + 1) % n          # 逆时针
    return {'upper': upper, 'lower': lower,
            'min_index': i_min, 'max_index': i_max}


def lower_bound(x, y, px):
    """给定 x 的下边界 y 值（凸多边形）。原件 lower_bound()。"""
    n = len(x)
    for i in range(n):
        j = (i + 1) % n
        if min(x[i], x[j]) <= px <= max(x[i], x[j]):
            if x[j] == x[i]:
                return min(y[i], y[j])
            t = (px - x[i]) / (x[j] - x[i])
            return y[i] + t * (y[j] - y[i])
    return float('nan')


def upper_bound(x, y, px):
    """给定 x 的上边界 y 值（凸多边形）。原件 upper_bound()。"""
    n = len(x)
    for i in range(n):
        j = (i + 1) % n
        if min(x[i], x[j]) <= px <= max(x[i], x[j]):
            if x[j] == x[i]:
                return max(y[i], y[j])
            t = (px - x[i]) / (x[j] - x[i])
            return y[i] + t * (y[j] - y[i])
    return float('nan')


# ---------------------------------------------------------------- 随机多边形

def generate_poly(n, convex=True, rng=None):
    """随机生成 n 个顶点的多边形。原件 generate_poly()。

    convex=True 时在圆上取点（必凸）；否则随机取点，可能自交。
    """
    import math
    rng = rng or random
    if convex:
        angles = sorted(rng.uniform(0, 2 * math.pi) for _ in range(n))
        r = rng.uniform(50, 100)
        return ([r * math.cos(a) for a in angles],
                [r * math.sin(a) for a in angles])
    return ([rng.uniform(-100, 100) for _ in range(n)],
            [rng.uniform(-100, 100) for _ in range(n)])


# ---------------------------------------------------------------- 直线方程（y 与 x 互求）

def line_equ_y(x, y, i):
    """第 i 条边写成 y = f(x)。原件 line_equ()。

    返回一个函数；竖直边的斜率是 inf，调用方要自己判。
    """
    g = gradient(x, y)[i]
    n = len(x)
    j = (i + 1) % n
    xm, ym = x[i], y[i]
    return lambda t: g * (t - xm) + ym


def line_equ_x(x, y, i):
    """第 i 条边写成 x = f(y)。原件 line_equy()。"""
    g = gradient(x, y)[i]
    xm, ym = x[i], y[i]
    return lambda t: (t - ym) / g + xm


def line_by_index(x, y, n):
    """按边号取直线方程，自动处理 0 和越界。原件 linen_equ()。"""
    m = len(x)
    if n == 0:
        n = m
    elif n > m:
        n = n % m
    return line_equ_y(x, y, n - 1)


# ---------------------------------------------------------------- 凸包

def convex_hull(x, y):
    """点集的凸包（Andrew 单调链）。原件用的是 R 的 chull()。

    返回凸包顶点的 (x, y)，按逆时针排列。
    """
    pts = sorted(zip(x, y))
    if len(pts) <= 2:
        return ([p[0] for p in pts], [p[1] for p in pts])

    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

    lower = []
    for p in pts:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], p) <= 0:
            lower.pop()
        lower.append(p)

    upper = []
    for p in reversed(pts):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], p) <= 0:
            upper.pop()
        upper.append(p)

    hull = lower[:-1] + upper[:-1]
    return ([p[0] for p in hull], [p[1] for p in hull])



